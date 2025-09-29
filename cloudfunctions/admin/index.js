const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COLLECTIONS = {
  USERS: 'users',
  MENUS: 'menus',
  MENU_ROLES: 'menu_roles',
  CATEGORIES: 'categories',
  OPTIONS: 'options',
  DISHES: 'dishes',
  CARTS: 'carts',
  ORDERS: 'orders',
  NOTIFICATIONS: 'notifications',
};

class CloudFunctionError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const generateId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const normalizeDoc = (doc) => {
  if (!doc) {
    return doc;
  }
  if (!doc.id) {
    doc.id = doc._id;
  }
  return doc;
};

const getDocumentById = async (collection, id) => {
  if (!id) {
    return null;
  }
  try {
    const result = await db.collection(collection).doc(id).get();
    return normalizeDoc(result.data);
  } catch (error) {
    if (error?.errCode === 'DOCUMENT_NOT_FOUND' || error?.errMsg?.includes('document.get:fail')) {
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
    return normalizeDoc(existing.data);
  } catch (error) {
    if (error?.errCode !== 'DOCUMENT_NOT_FOUND' && !error?.errMsg?.includes('document.get:fail')) {
      throw error;
    }
  }
  const user = {
    id: userId,
    nickname: '云开发管理员',
    avatar: 'https://dummyimage.com/100x100/1479ff/ffffff&text=DIY',
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
  const existing = await db
    .collection(COLLECTIONS.MENU_ROLES)
    .where({ userId, menuId })
    .get();
  if (existing.data.length > 0) {
    const docId = existing.data[0]._id;
    const nextRoles = Array.from(new Set([...(existing.data[0].roles || []), ...roles]));
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
    roles,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection(COLLECTIONS.MENU_ROLES).doc(docId).set({ data: roleDoc });
  return normalizeDoc(roleDoc);
};

const ensureBootstrapData = async (ctx) => {
  const now = Date.now();
  const menuId = 'menu-001';
  const defaultCategoryId = 'cat-001';
  const menusCol = db.collection(COLLECTIONS.MENUS);
  const categoriesCol = db.collection(COLLECTIONS.CATEGORIES);
  const optionsCol = db.collection(COLLECTIONS.OPTIONS);
  const dishesCol = db.collection(COLLECTIONS.DISHES);

  const menu = await getDocumentById(COLLECTIONS.MENUS, menuId);
  if (!menu) {
    const menuDoc = {
      id: menuId,
      name: '渔火小馆',
      description: '主打川菜与家常菜的共享菜单',
      defaultCategoryId,
      theme: 'light',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    await menusCol.doc(menuId).set({ data: menuDoc });

    const categories = [
      { id: 'cat-001', name: '热菜', sortOrder: 10 },
      { id: 'cat-002', name: '凉菜', sortOrder: 20 },
      { id: 'cat-003', name: '汤羹', sortOrder: 30 },
    ];
    for (const category of categories) {
      const doc = {
        id: category.id,
        menuId,
        name: category.name,
        sortOrder: category.sortOrder,
        createdAt: now,
        updatedAt: now,
      };
      await categoriesCol.doc(category.id).set({ data: doc });
    }

    const options = [
      {
        id: 'opt-001',
        name: '辣度',
        required: true,
        defaultChoice: 'mild',
        choices: [
          { label: '不辣', value: 'none', sortOrder: 10 },
          { label: '微辣', value: 'mild', sortOrder: 20 },
          { label: '中辣', value: 'medium', sortOrder: 30 },
          { label: '特辣', value: 'hot', sortOrder: 40 },
        ],
      },
      {
        id: 'opt-002',
        name: '份量',
        required: false,
        defaultChoice: 'regular',
        choices: [
          { label: '小份', value: 'small', sortOrder: 10 },
          { label: '常规', value: 'regular', sortOrder: 20 },
          { label: '加大', value: 'large', sortOrder: 30 },
        ],
      },
    ];
    for (const option of options) {
      const doc = {
        id: option.id,
        menuId,
        name: option.name,
        required: option.required,
        defaultChoice: option.defaultChoice,
        choices: option.choices,
        createdAt: now,
        updatedAt: now,
      };
      await optionsCol.doc(option.id).set({ data: doc });
    }

    const dishes = [
      {
        id: 'dish-001',
        categoryId: 'cat-001',
        name: '水煮鱼',
        description: '麻辣鲜香的招牌水煮鱼',
        image: 'https://dummyimage.com/300x200/d97706/ffffff&text=Fish',
        price: 68,
        status: 'on',
        tags: ['招牌', '川菜'],
        optionIds: ['opt-001', 'opt-002'],
        stock: 20,
        sortOrder: 10,
      },
      {
        id: 'dish-002',
        categoryId: 'cat-001',
        name: '宫保鸡丁',
        description: '经典家常菜，酸甜微辣',
        image: 'https://dummyimage.com/300x200/ef4444/ffffff&text=Kung+Pao',
        price: 42,
        status: 'on',
        tags: ['热销'],
        optionIds: ['opt-001'],
        stock: 50,
        sortOrder: 20,
      },
      {
        id: 'dish-003',
        categoryId: 'cat-002',
        name: '口水鸡',
        description: '开胃凉菜，麻辣香浓',
        image: 'https://dummyimage.com/300x200/f97316/ffffff&text=Chicken',
        price: 32,
        status: 'on',
        tags: ['凉菜'],
        optionIds: ['opt-001'],
        stock: 30,
        sortOrder: 10,
      },
    ];
    for (const dish of dishes) {
      const doc = {
        id: dish.id,
        menuId,
        categoryId: dish.categoryId,
        name: dish.name,
        description: dish.description,
        image: dish.image,
        price: dish.price,
        status: dish.status,
        tags: dish.tags,
        optionIds: dish.optionIds,
        stock: dish.stock,
        sortOrder: dish.sortOrder,
        createdAt: now,
        updatedAt: now,
      };
      await dishesCol.doc(dish.id).set({ data: doc });
    }
  }

  await upsertMenuRole(ctx.user.id, menuId, ['admin', 'chef', 'customer']);
  ctx.menuRoleMap = null;
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

const pick = (source, keys) => {
  const result = {};
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  });
  return result;
};

const handlers = {
  bootstrapData: async (ctx) => {
    await ensureBootstrapData(ctx);
    return true;
  },

  createMenu: async (ctx, payload = {}) => {
    const name = (payload.name || '').trim();
    const description = (payload.description || '').trim();
    const theme = payload.theme || 'light';
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
    const allowed = pick(updates, ['name', 'description', 'theme', 'status', 'defaultCategoryId']);
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
    return res.data.map(normalizeDoc);
  },

  upsertOption: async (ctx, payload) => {
    const option = payload.option || payload;
    const menuId = option.menuId;
    if (!menuId) {
      throw new CloudFunctionError('invalid_payload', 'menuId_required');
    }
    await assertAdmin(ctx, menuId);
    const now = Date.now();
    if (option.id) {
      const allowed = pick(option, ['name', 'choices', 'required', 'defaultChoice']);
      allowed.updatedAt = now;
      await db.collection(COLLECTIONS.OPTIONS).doc(option.id).update({ data: allowed });
      const updated = await getDocumentById(COLLECTIONS.OPTIONS, option.id);
      return updated;
    }
    const id = generateId('opt');
    const doc = {
      id,
      menuId,
      name: option.name,
      choices: option.choices || [],
      required: option.required || false,
      defaultChoice: option.defaultChoice || null,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.OPTIONS).doc(id).set({ data: doc });
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
      'stock',
    ]);
    data.optionIds = Array.isArray(data.optionIds)
      ? Array.from(new Set(data.optionIds.map(String)))
      : [];
    data.tags = Array.isArray(data.tags) ? data.tags : [];
    data.updatedAt = now;
    if (dish.id) {
      await db.collection(COLLECTIONS.DISHES).doc(dish.id).update({ data });
      const updated = await getDocumentById(COLLECTIONS.DISHES, dish.id);
      return updated;
    }
    const id = generateId('dish');
    data.id = id;
    data.createdAt = now;
    data.sortOrder = now;
    await db.collection(COLLECTIONS.DISHES).doc(id).set({ data });
    return data;
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
    const { menuId, categoryId, sortedIds = [] } = payload;
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
};

exports.main = async (event, context) => {
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
