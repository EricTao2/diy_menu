const STORAGE_KEY = 'diy-menu-mock-db';
const USER_KEY = 'diy-menu-current-user';

const DEFAULT_USER = {
  id: 'user-001',
  nickname: '测试用户',
  avatar: 'https://dummyimage.com/100x100/1f6feb/ffffff&text=DIY',
};

const DEFAULT_DATA = {
  users: [DEFAULT_USER],
  menus: [
    {
      id: 'menu-001',
      name: '渔火小馆',
      description: '主打川菜与家常菜的共享菜单',
      defaultCategoryId: 'cat-001',
      theme: 'light',
      status: 'active',
    },
    {
      id: 'menu-002',
      name: 'Daily Brunch',
      description: '早午餐实验菜单',
      defaultCategoryId: 'cat-101',
      theme: 'forest',
      status: 'active',
    },
  ],
  menuRoles: [
    { id: 'mr-001', menuId: 'menu-001', userId: 'user-001', roles: ['admin', 'chef', 'customer'] },
    { id: 'mr-002', menuId: 'menu-002', userId: 'user-001', roles: ['customer'] },
  ],
  categories: [
    { id: 'cat-001', menuId: 'menu-001', name: '热菜', sortOrder: 10 },
    { id: 'cat-002', menuId: 'menu-001', name: '凉菜', sortOrder: 20 },
    { id: 'cat-003', menuId: 'menu-001', name: '汤羹', sortOrder: 30 },
    { id: 'cat-101', menuId: 'menu-002', name: 'Brunch Classics', sortOrder: 10 },
  ],
  options: [
    {
      id: 'opt-001',
      menuId: 'menu-001',
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
      menuId: 'menu-001',
      name: '份量',
      required: false,
      defaultChoice: 'regular',
      choices: [
        { label: '小份', value: 'small', sortOrder: 10 },
        { label: '常规', value: 'regular', sortOrder: 20 },
        { label: '加大', value: 'large', sortOrder: 30 },
      ],
    },
    {
      id: 'opt-101',
      menuId: 'menu-002',
      name: '蛋白偏好',
      required: false,
      defaultChoice: null,
      choices: [
        { label: 'Bacon', value: 'bacon', sortOrder: 10 },
        { label: 'Chicken Sausage', value: 'chicken_s', sortOrder: 20 },
        { label: 'Smoked Salmon', value: 'salmon', sortOrder: 30 },
      ],
    },
  ],
  dishes: [
    {
      id: 'dish-001',
      menuId: 'menu-001',
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
      menuId: 'menu-001',
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
      menuId: 'menu-001',
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
    {
      id: 'dish-101',
      menuId: 'menu-002',
      categoryId: 'cat-101',
      name: 'Classic Benedict',
      description: '水煮蛋配荷兰酱和英式松饼',
      image: 'https://dummyimage.com/300x200/2563eb/ffffff&text=Benedict',
      price: 58,
      status: 'on',
      tags: ['Brunch'],
      optionIds: ['opt-101'],
      stock: 15,
      sortOrder: 10,
    },
  ],
  carts: [],
  orders: [
    {
      id: 'order-001',
      menuId: 'menu-001',
      userId: 'user-001',
      orderNo: 'M20230401-001',
      status: 'processing',
      totalPrice: 100,
      remark: '少辣',
      tableNo: 'A12',
      pickupType: 'dine-in',
      historyRefId: null,
      createdAt: Date.now() - 1000 * 60 * 60 * 12,
      updatedAt: Date.now() - 1000 * 60 * 30,
      handledBy: 'user-001',
      handledRemark: '制作中',
      items: [
        {
          dishId: 'dish-001',
          name: '水煮鱼',
          quantity: 1,
          unitPrice: 68,
          optionsSnapshot: {
            辣度: '中辣',
            份量: '常规',
          },
        },
        {
          dishId: 'dish-002',
          name: '宫保鸡丁',
          quantity: 1,
          unitPrice: 32,
          optionsSnapshot: {
            辣度: '微辣',
          },
        },
      ],
    },
  ],
  notifications: [],
};

const delay = (data, timeout = 120) =>
  new Promise((resolve) => setTimeout(() => resolve(clone(data)), timeout));

const clone = (value) => JSON.parse(JSON.stringify(value));

const loadDB = () => {
  const stored = wx.getStorageSync(STORAGE_KEY);
  if (!stored) {
    wx.setStorageSync(STORAGE_KEY, clone(DEFAULT_DATA));
    return clone(DEFAULT_DATA);
  }
  return clone(stored);
};

const saveDB = (db) => {
  wx.setStorageSync(STORAGE_KEY, db);
};

const ensureUser = () => {
  const user = wx.getStorageSync(USER_KEY);
  if (user) {
    return user;
  }
  wx.setStorageSync(USER_KEY, DEFAULT_USER);
  return DEFAULT_USER;
};

const generateId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export const bootstrapMockData = async () => {
  ensureUser();
  loadDB();
  return delay(true, 30);
};

export const getCurrentUser = async () => {
  return delay(ensureUser());
};

export const getMenusForCurrentUser = async () => {
  const db = loadDB();
  const user = ensureUser();
  const roles = db.menuRoles.filter((item) => item.userId === user.id);
  const menus = roles.map((role) => {
    const menu = db.menus.find((m) => m.id === role.menuId);
    return menu
      ? {
          ...menu,
          roles: role.roles,
        }
      : null;
  });
  return delay(menus.filter(Boolean));
};

export const getMenuDetail = async (menuId) => {
  const db = loadDB();
  const menu = db.menus.find((item) => item.id === menuId);
  if (!menu) {
    throw new Error('menu_not_found');
  }
  return delay(menu);
};

export const updateMenuSettings = async (menuId, payload) => {
  const db = loadDB();
  db.menus = db.menus.map((menu) =>
    menu.id === menuId ? { ...menu, ...payload, updatedAt: Date.now() } : menu
  );
  saveDB(db);
  return delay(true);
};

export const createMenu = async ({ name, description = '', theme = 'light' }) => {
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    throw new Error('name_required');
  }
  const db = loadDB();
  const user = ensureUser();
  const now = Date.now();
  const menuId = generateId('menu');
  const defaultCategoryId = generateId('cat');
  const menu = {
    id: menuId,
    name: trimmedName,
    description: description || '',
    defaultCategoryId,
    theme: theme || 'light',
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
  db.menus.push(menu);
  db.categories.push(defaultCategory);
  db.menuRoles.push({
    id: generateId('mr'),
    menuId,
    userId: user.id,
    roles: ['admin'],
    createdAt: now,
    updatedAt: now,
  });
  saveDB(db);
  return delay({ ...menu, roles: ['admin'] });
};

export const deleteMenu = async (menuId) => {
  const db = loadDB();
  const index = db.menus.findIndex((item) => item.id === menuId);
  if (index === -1) {
    return delay(false);
  }
  db.menus.splice(index, 1);
  db.categories = db.categories.filter((item) => item.menuId !== menuId);
  db.options = db.options.filter((item) => item.menuId !== menuId);
  db.dishes = db.dishes.filter((item) => item.menuId !== menuId);
  db.menuRoles = db.menuRoles.filter((item) => item.menuId !== menuId);
  db.carts = db.carts.filter((item) => item.menuId !== menuId);
  db.orders = db.orders.filter((item) => item.menuId !== menuId);
  db.notifications = db.notifications.filter((item) => item.menuId !== menuId);
  saveDB(db);
  return delay(true);
};

export const getCategoriesByMenu = async (menuId) => {
  const db = loadDB();
  const categories = db.categories
    .filter((item) => item.menuId === menuId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return delay(categories);
};

export const createCategory = async ({ menuId, name }) => {
  const db = loadDB();
  const category = {
    id: generateId('cat'),
    menuId,
    name,
    sortOrder: Date.now(),
    createdAt: Date.now(),
  };
  db.categories.push(category);
  saveDB(db);
  return delay(category);
};

export const updateCategory = async (categoryId, payload) => {
  const db = loadDB();
  db.categories = db.categories.map((item) => (item.id === categoryId ? { ...item, ...payload, updatedAt: Date.now() } : item));
  saveDB(db);
  return delay(true);
};

export const deleteCategory = async (categoryId) => {
  const db = loadDB();
  const category = db.categories.find((item) => item.id === categoryId);
  if (!category) {
    return delay(false);
  }
  const menu = db.menus.find((item) => item.id === category.menuId);
  const fallbackCategoryId = menu ? menu.defaultCategoryId : null;
  db.categories = db.categories.filter((item) => item.id !== categoryId);
  if (fallbackCategoryId) {
    db.dishes = db.dishes.map((dish) =>
      dish.categoryId === categoryId ? { ...dish, categoryId: fallbackCategoryId } : dish
    );
  }
  saveDB(db);
  return delay(true);
};

export const sortCategories = async (menuId, sortedIds) => {
  const db = loadDB();
  const now = Date.now();
  sortedIds.forEach((id, index) => {
    const category = db.categories.find((item) => item.id === id && item.menuId === menuId);
    if (category) {
      category.sortOrder = now + index;
    }
  });
  saveDB(db);
  return delay(true);
};

export const getOptionsByMenu = async (menuId) => {
  const db = loadDB();
  const options = db.options
    .filter((item) => item.menuId === menuId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return delay(options);
};

export const upsertOption = async (option) => {
  const db = loadDB();
  if (option.id) {
    db.options = db.options.map((item) => (item.id === option.id ? { ...item, ...option, updatedAt: Date.now() } : item));
  } else {
    option.id = generateId('opt');
    option.createdAt = Date.now();
    db.options.push(option);
  }
  saveDB(db);
  return delay(option);
};

export const deleteOption = async (optionId) => {
  const db = loadDB();
  db.options = db.options.filter((item) => item.id !== optionId);
  db.dishes = db.dishes.map((dish) => ({
    ...dish,
    optionIds: dish.optionIds.filter((id) => id !== optionId),
  }));
  saveDB(db);
  return delay(true);
};

export const getDishesByMenu = async (menuId) => {
  const db = loadDB();
  const dishes = db.dishes
    .filter((item) => item.menuId === menuId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return delay(dishes);
};

export const getDishDetail = async (dishId) => {
  const db = loadDB();
  const dish = db.dishes.find((item) => item.id === dishId);
  if (!dish) {
    throw new Error('dish_not_found');
  }
  return delay(dish);
};

export const upsertDish = async (dish) => {
  const db = loadDB();
  if (dish.id) {
    db.dishes = db.dishes.map((item) => (item.id === dish.id ? { ...item, ...dish, updatedAt: Date.now() } : item));
  } else {
    dish.id = generateId('dish');
    dish.createdAt = Date.now();
    dish.sortOrder = Date.now();
    db.dishes.push(dish);
  }
  saveDB(db);
  return delay(dish);
};

export const deleteDish = async (dishId) => {
  const db = loadDB();
  db.dishes = db.dishes.filter((item) => item.id !== dishId);
  saveDB(db);
  return delay(true);
};

export const sortDishes = async (menuId, categoryId, sortedIds) => {
  const db = loadDB();
  const base = Date.now();
  sortedIds.forEach((id, index) => {
    const dish = db.dishes.find((item) => item.id === id && item.categoryId === categoryId && item.menuId === menuId);
    if (dish) {
      dish.sortOrder = base + index;
    }
  });
  saveDB(db);
  return delay(true);
};

const getCartInternal = (db, menuId, userId) => {
  let cart = db.carts.find((item) => item.menuId === menuId && item.userId === userId);
  if (!cart) {
    cart = {
      id: generateId('cart'),
      menuId,
      userId,
      items: [],
      updatedAt: Date.now(),
    };
    db.carts.push(cart);
  }
  return cart;
};

export const getCart = async (menuId, userId) => {
  const db = loadDB();
  const cart = getCartInternal(db, menuId, userId);
  saveDB(db);
  return delay(cart);
};

export const updateCart = async (menuId, userId, items) => {
  const db = loadDB();
  const cart = getCartInternal(db, menuId, userId);
  cart.items = items;
  cart.updatedAt = Date.now();
  saveDB(db);
  return delay(cart);
};

export const clearCart = async (menuId, userId) => {
  const db = loadDB();
  const cart = getCartInternal(db, menuId, userId);
  cart.items = [];
  cart.updatedAt = Date.now();
  saveDB(db);
  return delay(true);
};

const createOrderNumber = (menuId) => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${menuId.toUpperCase()}-${y}${m}${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
};

export const submitOrder = async ({
  menuId,
  userId,
  items,
  totalPrice,
  remark,
  tableNo,
  pickupType,
  historyRefId = null,
}) => {
  const db = loadDB();
  const order = {
    id: generateId('order'),
    menuId,
    userId,
    orderNo: createOrderNumber(menuId),
    status: 'new',
    totalPrice,
    remark,
    tableNo,
    pickupType,
    historyRefId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    handledBy: null,
    handledRemark: '',
    items,
  };
  db.orders.unshift(order);
  const cart = getCartInternal(db, menuId, userId);
  cart.items = [];
  cart.updatedAt = Date.now();
  db.notifications.unshift({
    id: generateId('notification'),
    menuId,
    type: 'order:new',
    recipients: ['chef', 'admin'],
    payload: { orderId: order.id, orderNo: order.orderNo },
    createdAt: Date.now(),
    status: 'pending',
  });
  saveDB(db);
  return delay(order);
};

export const getOrdersByUser = async (userId, menuId) => {
  const db = loadDB();
  const orders = db.orders
    .filter((item) => item.userId === userId && item.menuId === menuId)
    .sort((a, b) => b.createdAt - a.createdAt);
  return delay(orders);
};

export const getOrdersByMenu = async (menuId, status = null) => {
  const db = loadDB();
  let orders = db.orders.filter((item) => item.menuId === menuId);
  if (status && status !== 'all') {
    orders = orders.filter((item) => item.status === status);
  }
  orders.sort((a, b) => b.createdAt - a.createdAt);
  return delay(orders);
};

export const updateOrderStatus = async (orderId, { status, handledBy, handledRemark }) => {
  const db = loadDB();
  db.orders = db.orders.map((order) => {
    if (order.id === orderId) {
      const updated = {
        ...order,
        status: status || order.status,
        handledBy: handledBy || order.handledBy,
        handledRemark: handledRemark ?? order.handledRemark,
        updatedAt: Date.now(),
      };
      db.notifications.unshift({
        id: generateId('notification'),
        menuId: order.menuId,
        type: 'order:status',
        recipients: ['customer'],
        payload: { orderId: order.id, status: updated.status },
        createdAt: Date.now(),
        status: 'pending',
      });
      return updated;
    }
    return order;
  });
  saveDB(db);
  return delay(true);
};

export const getNotifications = async (menuId, role) => {
  const db = loadDB();
  const notifications = db.notifications.filter((item) =>
    item.menuId === menuId && item.recipients.includes(role)
  );
  return delay(notifications);
};

export const markNotificationSent = async (notificationId) => {
  const db = loadDB();
  db.notifications = db.notifications.map((item) =>
    item.id === notificationId ? { ...item, status: 'sent', sentAt: Date.now() } : item
  );
  saveDB(db);
  return delay(true);
};

export const duplicateOrder = async (orderId) => {
  const db = loadDB();
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error('order_not_found');
  }
  const newOrder = {
    ...order,
    id: generateId('order'),
    orderNo: createOrderNumber(order.menuId),
    status: 'new',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    handledBy: null,
    handledRemark: '',
    historyRefId: order.id,
  };
  db.orders.unshift(newOrder);
  saveDB(db);
  return delay(newOrder);
};
