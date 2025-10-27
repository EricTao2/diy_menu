const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COLLECTIONS = {
  USERS: 'users',
  MENUS: 'menus',
  MENU_ROLES: 'menu_roles',
  MENU_INVITATIONS: 'menu_invitations',
  CATEGORIES: 'categories',
  OPTIONS: 'options',
  DISHES: 'dishes',
  CARTS: 'carts',
  ORDERS: 'orders',
  USER_NOTIFICATIONS: 'user_notifications',
  RECIPES: 'recipes',
  INGREDIENTS: 'ingredients',
};

const ROLE_PRIORITY = {
  admin: 1,
  chef: 2,
  customer: 3,
};

const ROLE_LABELS = {
  admin: '管理员',
  chef: '厨师',
  customer: '顾客',
};

const ALLOWED_ROLES = Object.keys(ROLE_PRIORITY);
const INVITE_TTL = 7 * 24 * 60 * 60 * 1000;

class CloudFunctionError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const generateId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const DEFAULT_AVATAR_URL = 'https://dummyimage.com/160x160/e2e8f0/475569&text=DIY';
const NICKNAME_PREFIXES = ['寻味', '鲜香', '食趣', '知味', '心选', '慢煮', '掌勺', '小食', '味觉', '家常'];
const NICKNAME_SUFFIXES = ['食客', '厨友', '料理官', '味友', '点单师', '餐桌侠', '小主', '试味员', '品鉴官', '掌勺人'];
const generateRandomNickname = () => {
  const prefix = NICKNAME_PREFIXES[Math.floor(Math.random() * NICKNAME_PREFIXES.length)] || '食趣';
  const suffix = NICKNAME_SUFFIXES[Math.floor(Math.random() * NICKNAME_SUFFIXES.length)] || '食客';
  const tail = Math.floor(100 + Math.random() * 900);
  return `${prefix}${suffix}${tail}`;
};

const normalizeDoc = (doc) => {
  if (!doc) {
    return doc;
  }
  if (!doc.id) {
    doc.id = doc._id;
  }
  return doc;
};

const ensureCollectionExists = async (collectionName) => {
  try {
    await db.collection(collectionName).limit(1).get();
  } catch (error) {
    const collectionMissing =
      error &&
      (error.errCode === -501007 ||
        error.errCode === -502005 ||
        error.errCode === 'DATABASE_COLLECTION_NOT_EXIST' ||
        (error.errMsg && error.errMsg.includes('collection does not exist')));
    if (!collectionMissing) {
      throw error;
    }
    try {
      await db.createCollection(collectionName);
    } catch (createError) {
      const alreadyExists =
        createError &&
        (createError.errCode === -502005 ||
          createError.errCode === -503001 ||
          createError.errMsg?.includes('already exists'));
      if (!alreadyExists) {
        throw createError;
      }
    }
  }
};

// 获取菜单下指定角色的用户ID列表
const getMenuUsersByRoles = async (menuId, roles) => {
  const menuRoles = await db.collection(COLLECTIONS.MENU_ROLES)
    .where({ 
      menuId,
      roles: _.in(roles)
    })
    .get();
  
  return menuRoles.data.map(role => role.userId);
};

// 创建用户通知
const createUserNotifications = async (menuId, userIds, type, payload) => {
  if (!userIds || userIds.length === 0) return;
  
  const now = Date.now();
  const notifications = userIds.map(userId => ({
    id: generateId('user-notif'),
    menuId,
    userId,
    type,
    payload,
    read: false,
    readAt: null,
    createdAt: now
  }));
  
  const collection = db.collection(COLLECTIONS.USER_NOTIFICATIONS);
  await Promise.all(
    notifications.map((notification) => collection.doc(notification.id).set({ data: notification }))
  );
  return notifications.length;
};

const getDocumentById = async (collection, id) => {
  if (!id) {
    return null;
  }
  try {
    const result = await db.collection(collection).doc(id).get();
    return normalizeDoc(result.data);
  } catch (error) {
    if ((error && error.errCode === 'DOCUMENT_NOT_FOUND') || (error && error.errMsg && error.errMsg.includes('document.get:fail'))) {
      return null;
    }
    throw error;
  }
};

const ensureUser = async (openid) => {
  const now = Date.now();
  const userId = openid;
  const users = db.collection(COLLECTIONS.USERS);
  try {
    const existing = await users.doc(userId).get();
    let user = normalizeDoc(existing.data);
    const patch = {};
    const needsNickname = !user.nickname;
    const needsAvatar = !user.avatar;
    if (needsNickname) {
      patch.nickname = generateRandomNickname();
    }
    if (needsAvatar) {
      patch.avatar = DEFAULT_AVATAR_URL;
    }
    const shouldRecalculateCompletion =
      needsNickname ||
      needsAvatar ||
      typeof user.profileCompleted === 'undefined' ||
      user.profileCompleted === false;
    if (shouldRecalculateCompletion) {
      const effectiveNickname = patch.nickname || user.nickname;
      const effectiveAvatar = patch.avatar || user.avatar;
      patch.profileCompleted = Boolean(effectiveNickname && effectiveAvatar);
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = now;
      await users.doc(userId).update({ data: patch });
      user = { ...user, ...patch };
    }
    return user;
  } catch (error) {
    const docNotFound =
      error &&
      (error.errCode === 'DOCUMENT_NOT_FOUND' ||
        (error.errMsg && error.errMsg.includes('document.get:fail')));
    const collectionMissing =
      error &&
      (error.errCode === -501007 ||
        error.errCode === -502005 ||
        error.errCode === 'DATABASE_COLLECTION_NOT_EXIST' ||
        (error.errMsg && error.errMsg.includes('collection does not exist')));
    if (!docNotFound && !collectionMissing) {
      throw error;
    }
    if (collectionMissing) {
      try {
        await db.createCollection(COLLECTIONS.USERS);
      } catch (createError) {
        const alreadyExists =
          createError &&
          (createError.errCode === -502005 ||
            createError.errCode === -503001 ||
            createError.errMsg?.includes('already exists'));
        if (!alreadyExists) {
          throw createError;
        }
      }
    }
  }
  const user = {
    id: userId,
    nickname: generateRandomNickname(),
    avatar: DEFAULT_AVATAR_URL,
    profileCompleted: true,
    createdAt: now,
    updatedAt: now,
    openid,
  };
  await users.doc(userId).set({
    data: user,
  });
  return normalizeDoc(user);
};

const ensureMenuRoleCache = async (ctx) => {
  if (ctx.menuRoleMap) {
    return ctx.menuRoleMap;
  }
  const roles = await db
    .collection(COLLECTIONS.MENU_ROLES)
    .where({ userId: ctx.user.id })
    .get();
  ctx.menuRoleMap = new Map();
  roles.data.forEach((item) => {
    normalizeDoc(item);
    ctx.menuRoleMap.set(item.menuId, item);
  });
  return ctx.menuRoleMap;
};

const upsertMenuRole = async (userId, menuId, roles) => {
  const now = Date.now();
  const incomingRoles = Array.isArray(roles) ? roles : [roles];
  const existing = await db
    .collection(COLLECTIONS.MENU_ROLES)
    .where({ userId, menuId })
    .get();
  if (existing.data.length > 0) {
    const docId = existing.data[0]._id;
    const nextRoles = normalizeRoles([...(existing.data[0].roles || []), ...incomingRoles]);
    await db.collection(COLLECTIONS.MENU_ROLES).doc(docId).update({
      data: { roles: nextRoles, updatedAt: now },
    });
    return normalizeDoc({ ...existing.data[0], roles: nextRoles, updatedAt: now });
  }
  const docId = generateId('mr');
  const roleDoc = {
    id: docId,
    userId,
    menuId,
    roles: normalizeRoles(incomingRoles),
    createdAt: now,
    updatedAt: now,
  };
  await db.collection(COLLECTIONS.MENU_ROLES).doc(docId).set({ data: roleDoc });
  return normalizeDoc(roleDoc);
};

const ensureBootstrapData = async () => {
  const collectionsToEnsure = [
    COLLECTIONS.USERS,
    COLLECTIONS.MENUS,
    COLLECTIONS.MENU_ROLES,
    COLLECTIONS.MENU_INVITATIONS,
    COLLECTIONS.CATEGORIES,
    COLLECTIONS.OPTIONS,
    COLLECTIONS.DISHES,
    COLLECTIONS.CARTS,
    COLLECTIONS.ORDERS,
    COLLECTIONS.USER_NOTIFICATIONS,
    COLLECTIONS.RECIPES,
    COLLECTIONS.INGREDIENTS,
  ];
  for (const name of collectionsToEnsure) {
    await ensureCollectionExists(name);
  }
  return true;
};

const ensureMenuAccess = async (ctx, menuId, requiredRole = null) => {
  const map = await ensureMenuRoleCache(ctx);
  const role = map.get(menuId);
  if (!role || !role.roles || role.roles.length === 0) {
    throw new CloudFunctionError('forbidden', 'no_role_for_menu');
  }
  if (requiredRole && !role.roles.includes(requiredRole)) {
    throw new CloudFunctionError('forbidden', `${requiredRole}_required`);
  }
  return role;
};

const assertAdmin = async (ctx, menuId) => ensureMenuAccess(ctx, menuId, 'admin');

const normalizeRoles = (roles = []) => {
  const unique = [];
  roles.forEach((role) => {
    if (!role || !ALLOWED_ROLES.includes(role)) {
      return;
    }
    if (!unique.includes(role)) {
      unique.push(role);
    }
  });
  unique.sort((a, b) => (ROLE_PRIORITY[a] || 99) - (ROLE_PRIORITY[b] || 99));
  return unique;
};

const fetchUsersByIds = async (ids = []) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const chunkSize = 10;
  const usersById = new Map();
  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const slice = uniqueIds.slice(index, index + chunkSize);
    const res = await db
      .collection(COLLECTIONS.USERS)
      .where({ _id: _.in(slice) })
      .get();
    res.data.forEach((doc) => {
      const normalized = normalizeDoc(doc);
      usersById.set(normalized.id, normalized);
    });
  }
  return usersById;
};

const pick = (source, keys) => {
  const result = {};
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  });
  return result;
};

const sanitizeOptionPayload = (option = {}) => {
  const rawChoices = Array.isArray(option.choices) ? option.choices : [];
  const seen = new Set();
  const choices = [];
  rawChoices.forEach((choice, index) => {
    if (!choice) {
      return;
    }
    const label = `${choice.label || ''}`.trim();
    if (!label) {
      return;
    }
    const value = `${choice.value || ''}`.trim();
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    const sortOrder = typeof choice.sortOrder === 'number' ? choice.sortOrder : Date.now() + index;
    choices.push({ label, value, sortOrder });
  });
  choices.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  let defaultChoice = option.defaultChoice;
  if (!defaultChoice || !choices.some((item) => item.value === defaultChoice)) {
    defaultChoice = choices[0] ? choices[0].value : null;
  }
  return { choices, defaultChoice };
};

const handlers = {
  bootstrapData: async () => {
    await ensureBootstrapData();
    return true;
  },

  createMenu: async (ctx, payload = {}) => {
    const name = (payload.name || '').trim();
    const description = (payload.description || '').trim();
    const theme = payload.theme || 'light';
    const coverImage = (payload.coverImage || '').trim();
    if (!name) {
      throw new CloudFunctionError('invalid_payload', 'name_required');
    }
    const now = Date.now();
    const menuId = generateId('menu');
    const defaultCategoryId = generateId('cat');
    const menuDoc = {
      id: menuId,
      name,
      description,
      defaultCategoryId,
      theme,
      status: 'active',
      coverImage,
      createdAt: now,
      updatedAt: now,
    };
    const defaultCategory = {
      id: defaultCategoryId,
      menuId,
      name: '默认分类',
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.MENUS).doc(menuId).set({ data: menuDoc });
    await db.collection(COLLECTIONS.CATEGORIES).doc(defaultCategoryId).set({ data: defaultCategory });
    await upsertMenuRole(ctx.user.id, menuId, ['admin']);
    ctx.menuRoleMap = null;
    return {
      ...menuDoc,
      roles: ['admin'],
    };
  },

  getCurrentUser: async (ctx) => ctx.user,

  updateCurrentUser: async (ctx, payload = {}) => {
    const updates = {};
    if (typeof payload.nickname === 'string') {
      updates.nickname = payload.nickname.trim();
    }
    if (typeof payload.avatar === 'string') {
      updates.avatar = payload.avatar.trim();
    }
    if (typeof payload.profileCompleted === 'boolean') {
      updates.profileCompleted = payload.profileCompleted;
    }
    if (Object.keys(updates).length === 0) {
      return ctx.user;
    }
    updates.updatedAt = Date.now();
    await db.collection(COLLECTIONS.USERS).doc(ctx.user.id).update({ data: updates });
    ctx.user = {
      ...ctx.user,
      ...updates,
    };
    return ctx.user;
  },

  getMenusForCurrentUser: async (ctx) => {
    const rolesMap = await ensureMenuRoleCache(ctx);
    if (rolesMap.size === 0) {
      return [];
    }
    const menuIds = Array.from(rolesMap.keys());
    const res = await db
      .collection(COLLECTIONS.MENUS)
      .where({ _id: _.in(menuIds) })
      .get();
    const menuById = new Map();
    res.data.forEach((menu) => {
      normalizeDoc(menu);
      menuById.set(menu._id, menu);
    });
    const result = [];
    menuIds.forEach((id) => {
      const menu = menuById.get(id);
      if (menu) {
        result.push({ ...menu, roles: rolesMap.get(id).roles });
      }
    });
    return result;
  },

  getMenuUsers: async (ctx, payload = {}) => {
    const { menuId, page = 1, pageSize = 20 } = payload;
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId_required');
    }
    await assertAdmin(ctx, menuId);
    const menu = await getDocumentById(COLLECTIONS.MENUS, menuId);
    if (!menu) {
      throw new CloudFunctionError('not_found', 'menu_not_found');
    }
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safePageSize = Math.max(parseInt(pageSize, 10) || 20, 1);
    const roleSnapshot = await db.collection(COLLECTIONS.MENU_ROLES).where({ menuId }).get();
    const roleEntries = roleSnapshot.data.map((entry) => normalizeDoc(entry));
    const usersById = await fetchUsersByIds(roleEntries.map((item) => item.userId));
    const records = roleEntries
      .map((entry) => {
        const user = usersById.get(entry.userId) || {};
        const roles = normalizeRoles(entry.roles || []);
        const primaryRole = roles[0] || 'customer';
        return {
          userId: entry.userId,
          nickname: user.nickname || '未命名用户',
          avatar: user.avatar || '',
          roles,
          roleLabels: roles.map((role) => ({ role, label: ROLE_LABELS[role] || role })),
          primaryRole,
          createdAt: entry.createdAt || 0,
          updatedAt: entry.updatedAt || entry.createdAt || 0,
        };
      })
      .sort((a, b) => {
        const roleDiff = (ROLE_PRIORITY[a.primaryRole] || 99) - (ROLE_PRIORITY[b.primaryRole] || 99);
        if (roleDiff !== 0) {
          return roleDiff;
        }
        const nameA = `${a.nickname || ''}`;
        const nameB = `${b.nickname || ''}`;
        return nameA.localeCompare(nameB, 'zh-Hans-CN');
      });
    const total = records.length;
    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    const items = records.slice(start, end);
    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      hasMore: end < total,
    };
  },

  updateMenuUserRoles: async (ctx, payload = {}) => {
    const { menuId, userId, roles = [] } = payload;
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId_required');
    }
    if (!userId) {
      throw new CloudFunctionError('invalid_payload', 'userId_required');
    }
    await assertAdmin(ctx, menuId);
    const menu = await getDocumentById(COLLECTIONS.MENUS, menuId);
    if (!menu) {
      throw new CloudFunctionError('not_found', 'menu_not_found');
    }
    const user = await getDocumentById(COLLECTIONS.USERS, userId);
    if (!user) {
      throw new CloudFunctionError('not_found', 'user_not_found');
    }
    const normalizedRoles = normalizeRoles(Array.isArray(roles) ? roles : [roles]);
    const now = Date.now();
    const existingSnapshot = await db.collection(COLLECTIONS.MENU_ROLES).where({ menuId, userId }).get();
    const existingRaw = existingSnapshot.data[0] || null;
    const existingDoc = existingRaw ? normalizeDoc(existingRaw) : null;
    const hadAdmin = existingDoc && existingDoc.roles && existingDoc.roles.includes('admin');
    const removingAdmin = hadAdmin && !normalizedRoles.includes('admin');
    if (removingAdmin) {
      const allRoles = await db.collection(COLLECTIONS.MENU_ROLES).where({ menuId }).get();
      const adminCount = allRoles.data.filter((item) => Array.isArray(item.roles) && item.roles.includes('admin')).length;
      if (adminCount <= 1) {
        throw new CloudFunctionError('invalid_operation', 'at_least_one_admin_required');
      }
    }
    if (!normalizedRoles.length) {
      if (existingDoc) {
        await db.collection(COLLECTIONS.MENU_ROLES).doc(existingDoc._id || existingDoc.id).remove();
      }
      ctx.menuRoleMap = null;
      return { menuId, userId, roles: [] };
    }
    if (existingDoc) {
      await db.collection(COLLECTIONS.MENU_ROLES).doc(existingDoc._id || existingDoc.id).update({
        data: { roles: normalizedRoles, updatedAt: now },
      });
    } else {
      const id = generateId('mr');
      await db.collection(COLLECTIONS.MENU_ROLES).doc(id).set({
        data: {
          id,
          menuId,
          userId,
          roles: normalizedRoles,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    ctx.menuRoleMap = null;
    return { menuId, userId, roles: normalizedRoles };
  },

  createMenuInvite: async (ctx, payload = {}) => {
    const { menuId, role = 'customer' } = payload;
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId_required');
    }
    await assertAdmin(ctx, menuId);
    const menu = await getDocumentById(COLLECTIONS.MENUS, menuId);
    if (!menu) {
      throw new CloudFunctionError('not_found', 'menu_not_found');
    }
    const now = Date.now();
    const inviteRole = ALLOWED_ROLES.includes(role) ? role : 'customer';
    const token = generateId('invite');
    const expiresAt = now + INVITE_TTL;
    const doc = {
      id: token,
      token,
      menuId,
      role: inviteRole,
      createdBy: ctx.user.id,
      createdAt: now,
      expiresAt,
      lastUsedAt: null,
    };
    try {
      await db.collection(COLLECTIONS.MENU_INVITATIONS).doc(token).set({ data: doc });
    } catch (error) {
      const collectionMissing =
        (error && error.errCode === -502005) || (error && error.errCode === 'DATABASE_COLLECTION_NOT_EXIST');
      if (collectionMissing) {
        await db.createCollection(COLLECTIONS.MENU_INVITATIONS);
        await db.collection(COLLECTIONS.MENU_INVITATIONS).doc(token).set({ data: doc });
      } else {
        throw error;
      }
    }
    const basePath = '/pages/menu-selector/index';
    const query = `menuId=${menuId}&inviteToken=${token}`;
    const fullPath = `${basePath}?${query}`;
    return {
      token,
      menuId,
      role: inviteRole,
      menuName: menu.name,
      expiresAt,
      path: fullPath,
    };
  },

  acceptMenuInvite: async (ctx, payload = {}) => {
    const { token, menuId: hintedMenuId } = payload;
    if (!token) {
      throw new CloudFunctionError('invalid_payload', 'token_required');
    }
    const invitation = await getDocumentById(COLLECTIONS.MENU_INVITATIONS, token);
    if (!invitation) {
      throw new CloudFunctionError('invalid_invite', 'invalid_invite');
    }
    if (hintedMenuId && invitation.menuId !== hintedMenuId) {
      throw new CloudFunctionError('invalid_invite', 'invite_mismatch');
    }
    if (invitation.expiresAt && invitation.expiresAt < Date.now()) {
      throw new CloudFunctionError('invite_expired', 'invite_expired');
    }
    const menu = await getDocumentById(COLLECTIONS.MENUS, invitation.menuId);
    if (!menu) {
      throw new CloudFunctionError('not_found', 'menu_not_found');
    }
    const roleToGrant = ALLOWED_ROLES.includes(invitation.role) ? invitation.role : 'customer';
    const updated = await upsertMenuRole(ctx.user.id, invitation.menuId, [roleToGrant]);
    await db
      .collection(COLLECTIONS.MENU_INVITATIONS)
      .doc(invitation._id || invitation.id)
      .update({ data: { lastUsedAt: Date.now() } });
    ctx.menuRoleMap = null;
    return {
      menuId: invitation.menuId,
      roles: normalizeRoles(updated.roles || []),
      menu,
    };
  },

  deleteMenu: async (ctx, payload = {}) => {
    const { menuId } = payload;
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId_required');
    }
    const menu = await getDocumentById(COLLECTIONS.MENUS, menuId);
    if (!menu) {
      return false;
    }
    await assertAdmin(ctx, menuId);
    await db.collection(COLLECTIONS.MENUS).doc(menuId).remove();
    await db.collection(COLLECTIONS.CATEGORIES).where({ menuId }).remove();
    await db.collection(COLLECTIONS.DISHES).where({ menuId }).remove();
    await db.collection(COLLECTIONS.OPTIONS).where({ menuId }).remove();
    await db.collection(COLLECTIONS.MENU_ROLES).where({ menuId }).remove();
    await db.collection(COLLECTIONS.CARTS).where({ menuId }).remove();
    await db.collection(COLLECTIONS.ORDERS).where({ menuId }).remove();
    await db.collection(COLLECTIONS.NOTIFICATIONS).where({ menuId }).remove();
    ctx.menuRoleMap = null;
    return true;
  },

  getMenuDetail: async (ctx, payload) => {
    const menu = await getDocumentById(COLLECTIONS.MENUS, payload.menuId);
    if (!menu) {
      throw new CloudFunctionError('not_found', 'menu_not_found');
    }
    await ensureMenuAccess(ctx, menu.id);
    return menu;
  },

  updateMenuSettings: async (ctx, payload) => {
    const { menuId, updates = {} } = payload;
    const menu = await getDocumentById(COLLECTIONS.MENUS, menuId);
    if (!menu) {
      throw new CloudFunctionError('not_found', 'menu_not_found');
    }
    await assertAdmin(ctx, menuId);
    const allowed = pick(updates, ['name', 'description', 'theme', 'status', 'defaultCategoryId', 'coverImage']);
    if (Object.keys(allowed).length === 0) {
      return true;
    }
    allowed.updatedAt = Date.now();
    await db.collection(COLLECTIONS.MENUS).doc(menuId).update({ data: allowed });
    return true;
  },

  getCategoriesByMenu: async (ctx, payload) => {
    await ensureMenuAccess(ctx, payload.menuId);
    const res = await db
      .collection(COLLECTIONS.CATEGORIES)
      .where({ menuId: payload.menuId })
      .orderBy('sortOrder', 'asc')
      .get();
    return res.data.map(normalizeDoc);
  },

  createCategory: async (ctx, payload) => {
    const { menuId, name } = payload;
    await assertAdmin(ctx, menuId);
    const now = Date.now();
    const id = generateId('cat');
  const doc = {
    id,
    menuId,
    name,
    sortOrder: now,
    createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.CATEGORIES).doc(id).set({ data: doc });
    return doc;
  },

  updateCategory: async (ctx, payload) => {
    const { categoryId, updates = {} } = payload;
    const category = await getDocumentById(COLLECTIONS.CATEGORIES, categoryId);
    if (!category) {
      throw new CloudFunctionError('not_found', 'category_not_found');
    }
    await assertAdmin(ctx, category.menuId);
    const allowed = pick(updates, ['name']);
    if (Object.keys(allowed).length === 0) {
      return true;
    }
    allowed.updatedAt = Date.now();
    await db.collection(COLLECTIONS.CATEGORIES).doc(categoryId).update({ data: allowed });
    return true;
  },

  deleteCategory: async (ctx, payload) => {
    const { categoryId } = payload;
    const category = await getDocumentById(COLLECTIONS.CATEGORIES, categoryId);
    if (!category) {
      return false;
    }
    await assertAdmin(ctx, category.menuId);
    const menu = await getDocumentById(COLLECTIONS.MENUS, category.menuId);
    if (!menu) {
      throw new CloudFunctionError('not_found', 'menu_not_found');
    }
    if (menu.defaultCategoryId === categoryId) {
      throw new CloudFunctionError('invalid_operation', 'default_category_cannot_delete');
    }
    await db.collection(COLLECTIONS.CATEGORIES).doc(categoryId).remove();
    const fallback = menu.defaultCategoryId;
    if (fallback) {
      await db
        .collection(COLLECTIONS.DISHES)
        .where({ menuId: category.menuId, categoryId })
        .update({ data: { categoryId: fallback, updatedAt: Date.now() } });
    }
    return true;
  },

  sortCategories: async (ctx, payload) => {
    const { menuId, sortedIds = [] } = payload;
    await assertAdmin(ctx, menuId);
    const base = Date.now();
    let index = 0;
    for (const id of sortedIds) {
      await db.collection(COLLECTIONS.CATEGORIES).doc(id).update({
        data: { sortOrder: base + index, updatedAt: Date.now() },
      });
      index += 1;
    }
    return true;
  },

  getOptionsByMenu: async (ctx, payload) => {
    await ensureMenuAccess(ctx, payload.menuId);
    const res = await db
      .collection(COLLECTIONS.OPTIONS)
      .where({ menuId: payload.menuId })
      .orderBy('name', 'asc')
      .get();
    return res.data.map((item) => {
      const doc = normalizeDoc(item);
      if (doc && Object.prototype.hasOwnProperty.call(doc, 'required')) {
        delete doc.required;
      }
      return doc;
    });
  },

  upsertOption: async (ctx, payload) => {
    const option = payload.option || payload;
    const menuId = option.menuId;
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId_required');
    }
    await assertAdmin(ctx, menuId);
    const now = Date.now();
    const { choices, defaultChoice } = sanitizeOptionPayload(option);
    if (option.id) {
      const allowed = pick(option, ['name']);
      allowed.choices = choices;
      allowed.defaultChoice = defaultChoice;
      allowed.updatedAt = now;
      allowed.required = _.remove();
      await db.collection(COLLECTIONS.OPTIONS).doc(option.id).update({ data: allowed });
      const updated = await getDocumentById(COLLECTIONS.OPTIONS, option.id);
      if (updated && Object.prototype.hasOwnProperty.call(updated, 'required')) {
        delete updated.required;
      }
      return updated;
    }
    const id = generateId('opt');
    const doc = {
      id,
      menuId,
      name: option.name,
      choices,
      defaultChoice,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.OPTIONS).doc(id).set({ data: doc });
    if (Object.prototype.hasOwnProperty.call(doc, 'required')) {
      delete doc.required;
    }
    return doc;
  },

  deleteOption: async (ctx, payload) => {
    const { optionId } = payload;
    if (!optionId) {
      return false;
    }
    const option = await getDocumentById(COLLECTIONS.OPTIONS, optionId);
    if (!option) {
      return false;
    }
    await assertAdmin(ctx, option.menuId);
    await db.collection(COLLECTIONS.OPTIONS).doc(optionId).remove();
    await db
      .collection(COLLECTIONS.DISHES)
      .where({ menuId: option.menuId, optionIds: optionId })
      .update({ data: { optionIds: _.pull(optionId), updatedAt: Date.now() } });
    return true;
  },

  getDishesByMenu: async (ctx, payload) => {
    await ensureMenuAccess(ctx, payload.menuId);
    const res = await db
      .collection(COLLECTIONS.DISHES)
      .where({ menuId: payload.menuId })
      .orderBy('sortOrder', 'asc')
      .get();
    return res.data.map(normalizeDoc);
  },

  getDishDetail: async (ctx, payload) => {
    const dish = await getDocumentById(COLLECTIONS.DISHES, payload.dishId);
    if (!dish) {
      throw new CloudFunctionError('not_found', 'dish_not_found');
    }
    await assertAdmin(ctx, dish.menuId);
    return {
      ...dish,
      optionIds: Array.isArray(dish.optionIds)
        ? Array.from(new Set(dish.optionIds.map(String)))
        : [],
    };
  },

  upsertDish: async (ctx, payload) => {
    const dish = payload.dish || payload;
    const menuId = dish.menuId;
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId_required');
    }
    await assertAdmin(ctx, menuId);
    const now = Date.now();
    const data = pick(dish, [
      'menuId',
      'categoryId',
      'name',
      'description',
      'image',
      'price',
      'status',
      'tags',
      'optionIds',
    ]);
    data.optionIds = Array.isArray(data.optionIds)
      ? Array.from(new Set(data.optionIds.map(String)))
      : [];
    data.tags = Array.isArray(data.tags) ? data.tags : [];
    data.updatedAt = now;
    const hasRecipeField = Object.prototype.hasOwnProperty.call(dish, 'recipeId');
    const recipeIdValue =
      typeof dish.recipeId === 'string'
        ? dish.recipeId.trim()
        : dish.recipeId
        ? String(dish.recipeId).trim()
        : '';
    if (dish.id) {
      const updateData = { ...data };
      if (hasRecipeField) {
        if (recipeIdValue) {
          updateData.recipeId = recipeIdValue;
        } else {
          updateData.recipeId = _.remove();
        }
      }
      await db.collection(COLLECTIONS.DISHES).doc(dish.id).update({ data: updateData });
      const updated = await getDocumentById(COLLECTIONS.DISHES, dish.id);
      return updated;
    }
    const id = generateId('dish');
    const createData = { ...data };
    if (hasRecipeField && recipeIdValue) {
      createData.recipeId = recipeIdValue;
    }
    createData.id = id;
    createData.createdAt = now;
    createData.sortOrder = now;
    await db.collection(COLLECTIONS.DISHES).doc(id).set({ data: createData });
    return createData;
  },

  deleteDish: async (ctx, payload) => {
    const { dishId } = payload;
    const dish = await getDocumentById(COLLECTIONS.DISHES, dishId);
    if (!dish) {
      return false;
    }
    await assertAdmin(ctx, dish.menuId);
    await db.collection(COLLECTIONS.DISHES).doc(dishId).remove();
    return true;
  },

  sortDishes: async (ctx, payload) => {
    const { menuId, sortedIds = [] } = payload;
    await assertAdmin(ctx, menuId);
    const base = Date.now();
    let index = 0;
    for (const id of sortedIds) {
      await db.collection(COLLECTIONS.DISHES).doc(id).update({
        data: { sortOrder: base + index, updatedAt: Date.now() },
      });
      index += 1;
    }
    return true;
  },

  getCart: async (ctx, payload) => {
    const { menuId, userId } = payload;
    await ensureMenuAccess(ctx, menuId);
    
    const res = await db
      .collection(COLLECTIONS.CARTS)
      .where({ menuId, userId })
      .get();
    
    if (res.data.length === 0) {
      // 创建空的购物车
      const now = Date.now();
      const cartId = generateId('cart');
      const cart = {
        id: cartId,
        menuId,
        userId,
        items: [],
        updatedAt: now,
      };
      await db.collection(COLLECTIONS.CARTS).doc(cartId).set({ data: cart });
      return normalizeDoc(cart);
    }
    
    return normalizeDoc(res.data[0]);
  },

  updateCart: async (ctx, payload) => {
    const { menuId, userId, items = [] } = payload;
    await ensureMenuAccess(ctx, menuId);
    
    const now = Date.now();
    const res = await db
      .collection(COLLECTIONS.CARTS)
      .where({ menuId, userId })
      .get();
    
    if (res.data.length === 0) {
      // 创建新的购物车
      const cartId = generateId('cart');
      const cart = {
        id: cartId,
        menuId,
        userId,
        items,
        updatedAt: now,
      };
      await db.collection(COLLECTIONS.CARTS).doc(cartId).set({ data: cart });
      return normalizeDoc(cart);
    } else {
      // 更新现有购物车
      const cartId = res.data[0]._id;
      await db.collection(COLLECTIONS.CARTS).doc(cartId).update({
        data: { items, updatedAt: now },
      });
      return normalizeDoc({
        ...res.data[0],
        items,
        updatedAt: now,
      });
    }
  },

  clearCart: async (ctx, payload) => {
    const { menuId, userId } = payload;
    await ensureMenuAccess(ctx, menuId);
    
    const res = await db
      .collection(COLLECTIONS.CARTS)
      .where({ menuId, userId })
      .get();
    
    if (res.data.length > 0) {
      const cartId = res.data[0]._id;
      await db.collection(COLLECTIONS.CARTS).doc(cartId).update({
        data: { items: [], updatedAt: Date.now() },
      });
    }
    
    return true;
  },

  // 订单相关功能
  submitOrder: async (ctx, payload) => {
    const { menuId, userId, items = [], totalPrice, remark = '', tableNo = '', historyRefId = null } = payload;
    
    if (!menuId || !userId || !Array.isArray(items) || items.length === 0) {
      throw new CloudFunctionError('invalid_payload', 'menuId, userId and items are required');
    }
    
    await ensureMenuAccess(ctx, menuId);
    
    // 验证菜品状态和价格
    const dishIds = items.map(item => item.dishId);
    const dishes = await db.collection(COLLECTIONS.DISHES)
      .where({ _id: _.in(dishIds), menuId })
      .get();
    
    const dishMap = new Map();
    dishes.data.forEach(dish => {
      normalizeDoc(dish);
      dishMap.set(dish._id, dish);
    });
    
    const now = Date.now();
    const orderId = generateId('order');
    const orderNo = `M${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    
    // 验证并处理订单项
    const orderItems = [];
    let calculatedTotal = 0;
    
    for (const item of items) {
      const dish = dishMap.get(item.dishId);
      if (!dish) {
        throw new CloudFunctionError('invalid_dish', `Dish ${item.dishId} not found`);
      }
      if (dish.status !== 'on') {
        throw new CloudFunctionError('dish_unavailable', `Dish ${dish.name} is not available`);
      }
      const orderItem = {
        dishId: item.dishId,
        name: dish.name,
        quantity: item.quantity,
        unitPrice: dish.price,
        recipeId: dish.recipeId || '',
        optionsSnapshot: item.optionsSnapshot || {},
      };
      
      orderItems.push(orderItem);
      calculatedTotal += dish.price * item.quantity;
    }
    
    if (Math.abs(calculatedTotal - totalPrice) > 0.01) {
      throw new CloudFunctionError('price_mismatch', 'Calculated total does not match provided total');
    }
    
    const order = {
      id: orderId,
      menuId,
      userId,
      orderNo,
      status: 'new',
      totalPrice: calculatedTotal,
      remark: remark.trim(),
      tableNo: tableNo.trim(),
      historyRefId,
      items: orderItems,
      createdAt: now,
      updatedAt: now,
      handledBy: null,
      handledRemark: '',
    };
    
    // 使用事务确保数据一致性
    const result = await db.runTransaction(async (transaction) => {
      // 创建订单
      await transaction.collection(COLLECTIONS.ORDERS).doc(orderId).set({ data: order });
      
      // 清空购物车
      const cartRes = await transaction.collection(COLLECTIONS.CARTS)
        .where({ menuId, userId })
        .get();
      
      if (cartRes.data.length > 0) {
        await transaction.collection(COLLECTIONS.CARTS).doc(cartRes.data[0]._id).update({
          data: { items: [], updatedAt: now }
        });
      }
      
      return order;
    });
    
    (async () => {
      try {
        const chefUsers = await getMenuUsersByRoles(menuId, ['chef']);
        if (!chefUsers || chefUsers.length === 0) {
          console.info('[notifications] order:new skipped - no chef users', {
            menuId,
            orderId,
          });
          return;
        }
        const recipientCount = await createUserNotifications(menuId, chefUsers, 'order:new', {
          orderId,
          orderNo,
        });
        console.info('[notifications] order:new dispatched', {
          menuId,
          orderId,
          recipientCount,
        });
      } catch (error) {
        console.error('[notifications] order:new failed', {
          menuId,
          orderId,
          error: error && error.message,
          stack: error && error.stack,
        });
      }
    })();
    
    return normalizeDoc(result);
  },

  getOrdersByUser: async (ctx, payload) => {
    const { userId, menuId } = payload;
    
    if (!userId || !menuId) {
      throw new CloudFunctionError('invalid_payload', 'userId and menuId are required');
    }
    
    await ensureMenuAccess(ctx, menuId);
    
    const res = await db
      .collection(COLLECTIONS.ORDERS)
      .where({ menuId, userId })
      .orderBy('createdAt', 'desc')
      .get();
    
    return res.data.map(normalizeDoc);
  },

  getOrdersByMenu: async (ctx, payload) => {
    const { menuId, status = null } = payload;
    
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId is required');
    }
    
    await ensureMenuAccess(ctx, menuId);
    
    let query = db.collection(COLLECTIONS.ORDERS).where({ menuId });
    
    if (status && status !== 'all') {
      query = query.where({ status });
    }
    
    const res = await query.orderBy('createdAt', 'desc').get();
    const orders = res.data.map((doc) => normalizeDoc({ ...doc }));
    
    if (!orders.length) {
      return orders;
    }
    
    const dishIdSet = new Set();
    orders.forEach((order) => {
      if (Array.isArray(order.items)) {
        order.items.forEach((item) => {
          if (item && item.dishId) {
            dishIdSet.add(item.dishId);
          }
        });
      }
    });
    
    const dishIds = Array.from(dishIdSet);
    const dishMap = new Map();
    if (dishIds.length) {
      const chunkSize = 10;
      for (let index = 0; index < dishIds.length; index += chunkSize) {
        const slice = dishIds.slice(index, index + chunkSize);
        const dishRes = await db
          .collection(COLLECTIONS.DISHES)
          .where({ _id: _.in(slice), menuId })
          .get();
        dishRes.data.forEach((dishDoc) => {
          const normalized = normalizeDoc({ ...dishDoc });
          dishMap.set(normalized.id, normalized);
        });
      }
    }
    
    return orders.map((order) => {
      if (!Array.isArray(order.items) || !order.items.length) {
        return order;
      }
      const items = order.items.map((item) => {
        const dish = dishMap.get(item.dishId);
        const recipeId = item.recipeId || dish?.recipeId || '';
        if (!recipeId) {
          return item;
        }
        return {
          ...item,
          recipeId,
        };
      });
      return {
        ...order,
        items,
      };
    });
  },

  updateOrderStatus: async (ctx, payload) => {
    const { orderId, status, handledBy, handledRemark = '' } = payload;
    
    if (!orderId || !status) {
      throw new CloudFunctionError('invalid_payload', 'orderId and status are required');
    }
    
    const order = await getDocumentById(COLLECTIONS.ORDERS, orderId);
    if (!order) {
      throw new CloudFunctionError('not_found', 'order_not_found');
    }
    
    await ensureMenuAccess(ctx, order.menuId);
    
    // 检查权限：只有厨师或管理员可以更新订单状态
    const role = await ensureMenuRoleCache(ctx);
    const userRole = role.get(order.menuId);
    if (!userRole || !userRole.roles.some(r => ['chef', 'admin'].includes(r))) {
      throw new CloudFunctionError('forbidden', 'insufficient_permission');
    }
    
    const now = Date.now();
    const operatorId = handledBy || ctx.user.id;
    const updates = {
      status,
      updatedAt: now,
      lastOperatorId: operatorId,
      lastOperatorAt: now,
    };
    
    if (handledBy) {
      updates.handledBy = handledBy;
    }
    if (handledRemark) {
      updates.handledRemark = handledRemark.trim();
    }
    
    await db.collection(COLLECTIONS.ORDERS).doc(orderId).update({ data: updates });
    
    // 创建状态变更通知 - 只发送给订单创建者
    const notificationPayload = { 
      orderId, 
      orderNo: order.orderNo, 
      status, 
      handledBy: handledBy || ctx.user.id,
      handledRemark 
    };
    
    // 只通知订单创建者
    await createUserNotifications(
      order.menuId, 
      [order.userId], 
      'order:status_changed', 
      notificationPayload
    );
    
    return normalizeDoc({ ...order, ...updates });
  },

  duplicateOrder: async (ctx, payload) => {
    const { orderId } = payload;
    
    if (!orderId) {
      throw new CloudFunctionError('invalid_payload', 'orderId is required');
    }
    
    const originalOrder = await getDocumentById(COLLECTIONS.ORDERS, orderId);
    if (!originalOrder) {
      throw new CloudFunctionError('not_found', 'order_not_found');
    }
    
    await ensureMenuAccess(ctx, originalOrder.menuId);
    
    const now = Date.now();
    const newOrderId = generateId('order');
    const newOrderNo = `M${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    
    // 验证菜品是否仍然可用
    const dishIds = originalOrder.items.map(item => item.dishId);
    const dishes = await db.collection(COLLECTIONS.DISHES)
      .where({ _id: _.in(dishIds), menuId: originalOrder.menuId })
      .get();
    
    const dishMap = new Map();
    dishes.data.forEach(dish => {
      normalizeDoc(dish);
      dishMap.set(dish._id, dish);
    });
    
    const validItems = [];
    let totalPrice = 0;
    
    for (const item of originalOrder.items) {
      const dish = dishMap.get(item.dishId);
      if (!dish || dish.status !== 'on') {
        continue; // 跳过不可用的菜品
      }
      
      const newItem = {
        ...item,
        unitPrice: dish.price, // 使用当前价格
      };
      
      validItems.push(newItem);
      totalPrice += dish.price * item.quantity;
    }
    
    if (validItems.length === 0) {
      throw new CloudFunctionError('no_valid_items', 'No valid items found in the original order');
    }
    
    const newOrder = {
      id: newOrderId,
      menuId: originalOrder.menuId,
      userId: ctx.user.id,
      orderNo: newOrderNo,
      status: 'new',
      totalPrice,
      remark: originalOrder.remark,
      tableNo: originalOrder.tableNo,
      historyRefId: originalOrder.id,
      items: validItems,
      createdAt: now,
      updatedAt: now,
      handledBy: null,
      handledRemark: '',
    };
    
    await db.collection(COLLECTIONS.ORDERS).doc(newOrderId).set({ data: newOrder });
    
    return normalizeDoc(newOrder);
  },

  getNotifications: async (ctx, payload) => {
    const { menuId, type = null, page = 1, pageSize = 20 } = payload;
    
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId is required');
    }
    
    await ensureMenuAccess(ctx, menuId);
    
    let query = db.collection(COLLECTIONS.USER_NOTIFICATIONS)
      .where({ 
        menuId,
        userId: ctx.user.id  // 只查询当前用户的通知
      });
    
    if (type) {
      query = query.where({ type });
    }
    
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safePageSize = Math.max(parseInt(pageSize, 10) || 20, 1);
    const skip = (safePage - 1) * safePageSize;
    
    const [countRes, dataRes] = await Promise.all([
      query.count(),
      query.orderBy('createdAt', 'desc').skip(skip).limit(safePageSize).get()
    ]);
    
    const total = countRes.total;
    const notifications = dataRes.data.map(normalizeDoc);
    
    return {
      items: notifications,
      total,
      page: safePage,
      pageSize: safePageSize,
      hasMore: skip + notifications.length < total,
    };
  },


  markNotificationRead: async (ctx, payload) => {
    const { notificationId } = payload;
    
    if (!notificationId) {
      throw new CloudFunctionError('invalid_payload', 'notificationId is required');
    }
    
    const notification = await getDocumentById(COLLECTIONS.USER_NOTIFICATIONS, notificationId);
    if (!notification) {
      throw new CloudFunctionError('not_found', 'notification_not_found');
    }
    
    // 确保用户只能标记自己的通知为已读
    if (notification.userId !== ctx.user.id) {
      throw new CloudFunctionError('forbidden', 'can_only_mark_own_notifications');
    }
    
    await ensureMenuAccess(ctx, notification.menuId);
    
    const now = Date.now();
    await db.collection(COLLECTIONS.USER_NOTIFICATIONS).doc(notificationId).update({
      data: { 
        read: true,
        readAt: now,
        updatedAt: now 
      }
    });
    
    return true;
  },

  markAllNotificationsRead: async (ctx, payload) => {
    const { menuId } = payload;
    
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId is required');
    }
    
    await ensureMenuAccess(ctx, menuId);
    
    const now = Date.now();
    await db.collection(COLLECTIONS.USER_NOTIFICATIONS)
      .where({ 
        menuId, 
        userId: ctx.user.id,  // 只标记当前用户的通知
        read: false 
      })
      .update({
        data: { 
          read: true,
          readAt: now,
          updatedAt: now 
        }
      });
    
    return true;
  },

  getUnreadNotificationCount: async (ctx, payload) => {
    const { menuId } = payload;
    
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId is required');
    }
    
    await ensureMenuAccess(ctx, menuId);
    
    const res = await db.collection(COLLECTIONS.USER_NOTIFICATIONS)
      .where({ 
        menuId, 
        userId: ctx.user.id,  // 只查询当前用户的未读通知
        read: false 
      })
      .count();
    
    return res.total;
  },

  getOrderDetail: async (ctx, payload) => {
    const { orderId } = payload;
    
    if (!orderId) {
      throw new CloudFunctionError('invalid_payload', 'orderId is required');
    }
    
    const order = await getDocumentById(COLLECTIONS.ORDERS, orderId);
    if (!order) {
      throw new CloudFunctionError('not_found', 'order_not_found');
    }
    
    await ensureMenuAccess(ctx, order.menuId);
    
    // 获取操作者信息
    const operatorIds = [];
    if (order.handledBy) {
      operatorIds.push(order.handledBy);
    }
    if (order.lastOperatorId && order.lastOperatorId !== order.handledBy) {
      operatorIds.push(order.lastOperatorId);
    }
    
    let operators = {};
    if (operatorIds.length > 0) {
      const uniqueOperatorIds = Array.from(new Set(operatorIds));
      const usersById = await fetchUsersByIds(uniqueOperatorIds);
      usersById.forEach((user, userId) => {
        operators[userId] = {
          id: userId,
          nickname: user.nickname || '未命名用户',
          avatar: user.avatar || '',
        };
      });
    }
    
    return {
      ...order,
      operators,
    };
  },

  // ==================== 菜谱管理 ====================
  
  getRecipes: async (ctx) => {
    // 获取当前用户的所有菜谱
    const res = await db.collection(COLLECTIONS.RECIPES)
      .where({ userId: ctx.user.id })
      .orderBy('createdAt', 'desc')
      .get();
    
    return res.data.map(normalizeDoc);
  },

  getRecipeById: async (ctx, payload) => {
    const { recipeId } = payload;
    
    if (!recipeId) {
      throw new CloudFunctionError('invalid_payload', 'recipeId is required');
    }
    
    const recipe = await getDocumentById(COLLECTIONS.RECIPES, recipeId);
    if (!recipe) {
      throw new CloudFunctionError('not_found', 'Recipe not found');
    }
    
    // 获取创建者信息
    const creator = await getDocumentById(COLLECTIONS.USERS, recipe.userId);
    
    return {
      ...recipe,
      creator: creator ? {
        id: creator.id,
        nickname: creator.nickname || '未命名用户',
        avatar: creator.avatar || '',
      } : null,
    };
  },

  createRecipe: async (ctx, payload) => {
    const { name, coverImage, content, ingredients = [] } = payload;
    
    if (!name || !name.trim()) {
      throw new CloudFunctionError('invalid_payload', 'Recipe name is required');
    }
    
    const now = Date.now();
    const recipeId = generateId('recipe');
    
    const recipe = {
      id: recipeId,
      userId: ctx.user.id,
      name: name.trim(),
      coverImage: coverImage || '',
      content: content || '',
      ingredients: Array.isArray(ingredients) ? ingredients : [],
      createdAt: now,
      updatedAt: now,
    };
    
    await db.collection(COLLECTIONS.RECIPES).doc(recipeId).set({ data: recipe });
    
    return normalizeDoc(recipe);
  },

  updateRecipe: async (ctx, payload) => {
    const { recipeId, name, coverImage, content, ingredients } = payload;
    
    if (!recipeId) {
      throw new CloudFunctionError('invalid_payload', 'recipeId is required');
    }
    
    const recipe = await getDocumentById(COLLECTIONS.RECIPES, recipeId);
    if (!recipe) {
      throw new CloudFunctionError('not_found', 'Recipe not found');
    }
    
    // 只能更新自己的菜谱
    if (recipe.userId !== ctx.user.id) {
      throw new CloudFunctionError('permission_denied', 'You can only update your own recipes');
    }
    
    const updates = { updatedAt: Date.now() };
    
    if (name !== undefined) {
      if (!name.trim()) {
        throw new CloudFunctionError('invalid_payload', 'Recipe name cannot be empty');
      }
      updates.name = name.trim();
    }
    
    if (coverImage !== undefined) {
      updates.coverImage = coverImage;
    }
    
    if (content !== undefined) {
      updates.content = content;
    }
    
    if (ingredients !== undefined) {
      updates.ingredients = Array.isArray(ingredients) ? ingredients : [];
    }
    
    await db.collection(COLLECTIONS.RECIPES).doc(recipeId).update({ data: updates });
    
    return normalizeDoc({ ...recipe, ...updates });
  },

  deleteRecipe: async (ctx, payload) => {
    const { recipeId } = payload;
    
    if (!recipeId) {
      throw new CloudFunctionError('invalid_payload', 'recipeId is required');
    }
    
    const recipe = await getDocumentById(COLLECTIONS.RECIPES, recipeId);
    if (!recipe) {
      throw new CloudFunctionError('not_found', 'Recipe not found');
    }
    
    // 只能删除自己的菜谱
    if (recipe.userId !== ctx.user.id) {
      throw new CloudFunctionError('permission_denied', 'You can only delete your own recipes');
    }
    
    await db.collection(COLLECTIONS.RECIPES).doc(recipeId).remove();
    
    return true;
  },

  // ==================== 原材料管理 ====================
  
  getIngredients: async (ctx) => {
    // 获取当前用户的所有原材料
    const res = await db.collection(COLLECTIONS.INGREDIENTS)
      .where({ userId: ctx.user.id })
      .orderBy('createdAt', 'desc')
      .get();
    
    return res.data.map(normalizeDoc);
  },

  createIngredient: async (ctx, payload) => {
    const { name, unit = '份', image, remark } = payload;
    
    if (!name || !name.trim()) {
      throw new CloudFunctionError('invalid_payload', 'Ingredient name is required');
    }
    
    const now = Date.now();
    const ingredientId = generateId('ingredient');
    
    const ingredient = {
      id: ingredientId,
      userId: ctx.user.id,
      name: name.trim(),
      unit: unit.trim() || '份',
      image: image || '',
      remark: remark || '',
      createdAt: now,
      updatedAt: now,
    };
    
    await db.collection(COLLECTIONS.INGREDIENTS).doc(ingredientId).set({ data: ingredient });
    
    return normalizeDoc(ingredient);
  },

  updateIngredient: async (ctx, payload) => {
    const { ingredientId, name, unit, image, remark } = payload;
    
    if (!ingredientId) {
      throw new CloudFunctionError('invalid_payload', 'ingredientId is required');
    }
    
    const ingredient = await getDocumentById(COLLECTIONS.INGREDIENTS, ingredientId);
    if (!ingredient) {
      throw new CloudFunctionError('not_found', 'Ingredient not found');
    }
    
    // 只能更新自己的原材料
    if (ingredient.userId !== ctx.user.id) {
      throw new CloudFunctionError('permission_denied', 'You can only update your own ingredients');
    }
    
    const updates = { updatedAt: Date.now() };
    
    if (name !== undefined) {
      if (!name.trim()) {
        throw new CloudFunctionError('invalid_payload', 'Ingredient name cannot be empty');
      }
      updates.name = name.trim();
    }
    
    if (unit !== undefined) {
      updates.unit = unit.trim() || '份';
    }
    
    if (image !== undefined) {
      updates.image = image;
    }
    
    if (remark !== undefined) {
      updates.remark = remark;
    }
    
    await db.collection(COLLECTIONS.INGREDIENTS).doc(ingredientId).update({ data: updates });
    
    return normalizeDoc({ ...ingredient, ...updates });
  },

  deleteIngredient: async (ctx, payload) => {
    const { ingredientId } = payload;
    
    if (!ingredientId) {
      throw new CloudFunctionError('invalid_payload', 'ingredientId is required');
    }
    
    const ingredient = await getDocumentById(COLLECTIONS.INGREDIENTS, ingredientId);
    if (!ingredient) {
      throw new CloudFunctionError('not_found', 'Ingredient not found');
    }
    
    // 只能删除自己的原材料
    if (ingredient.userId !== ctx.user.id) {
      throw new CloudFunctionError('permission_denied', 'You can only delete your own ingredients');
    }
    
    await db.collection(COLLECTIONS.INGREDIENTS).doc(ingredientId).remove();
    
    return true;
  },
};

exports.main = async (event) => {
  const { action, payload = {} } = event || {};
  const wxContext = cloud.getWXContext();
  const ctx = {
    wxContext,
    user: null,
    menuRoleMap: null,
  };

  try {
    if (!action || !handlers[action]) {
      throw new CloudFunctionError('unknown_action', `Unsupported action: ${action}`);
    }

    ctx.user = await ensureUser(wxContext.OPENID);

    const result = await handlers[action](ctx, payload);
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('admin cloud function error', action, error);
    return {
      success: false,
      error: error.message || 'internal_error',
      code: error.code || 'internal_error',
    };
  }
};
