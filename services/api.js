import { cloudbaseConfig } from '../config/index';
import * as mockService from './mock';
import * as cloudService from './cloud';

const shouldUseMock = cloudbaseConfig.useMock;

const createApiLayer = () => {
  if (shouldUseMock) {
    return mockService;
  }
  return cloudService;
};

const api = createApiLayer();

export default api;
export const {
  bootstrapMockData,
  createMenu,
  getCurrentUser,
  updateCurrentUser,
  getMenusForCurrentUser,
  getMenuDetail,
  updateMenuSettings,
  deleteMenu,
  getCategoriesByMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  sortCategories,
  getOptionsByMenu,
  upsertOption,
  deleteOption,
  getDishesByMenu,
  getDishDetail,
  upsertDish,
  deleteDish,
  sortDishes,
  getCart,
  updateCart,
  clearCart,
  submitOrder,
  getOrdersByUser,
  getOrdersByMenu,
  updateOrderStatus,
  getNotifications,
  markNotificationSent,
  duplicateOrder,
  getMenuUsers,
  updateMenuUserRoles,
  createMenuInvite,
  acceptMenuInvite,
} = api;
