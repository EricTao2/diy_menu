import { callCloudFunction } from '../utils/cloud';
import * as mockService from './mock';

const CLOUD_FUNCTION_NAME = 'admin';

const callAdmin = async (action, payload = {}) => {
  const { result } = await callCloudFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action, payload },
  });
  if (!result) {
    throw new Error('empty_cloud_result');
  }
  if (!result.success) {
    const error = new Error(result.error || 'cloud_function_error');
    error.code = result.code;
    throw error;
  }
  return result.data;
};

export const bootstrapMockData = async () => {
  try {
    return await callAdmin('bootstrapData');
  } catch (error) {
    console.warn('[cloudService] bootstrap fallback to mock due to error:', error);
    return mockService.bootstrapMockData();
  }
};
export const createMenu = (payload) => callAdmin('createMenu', payload);
export const getCurrentUser = () => callAdmin('getCurrentUser');
export const updateCurrentUser = (updates) => callAdmin('updateCurrentUser', updates);
export const getMenusForCurrentUser = () => callAdmin('getMenusForCurrentUser');
export const getMenuDetail = (menuId) => callAdmin('getMenuDetail', { menuId });
export const updateMenuSettings = (menuId, updates) =>
  callAdmin('updateMenuSettings', { menuId, updates });
export const deleteMenu = (menuId) => callAdmin('deleteMenu', { menuId });
export const getCategoriesByMenu = (menuId) =>
  callAdmin('getCategoriesByMenu', { menuId });
export const createCategory = (data) => callAdmin('createCategory', data);
export const updateCategory = (categoryId, updates) =>
  callAdmin('updateCategory', { categoryId, updates });
export const deleteCategory = (categoryId) =>
  callAdmin('deleteCategory', { categoryId });
export const sortCategories = (menuId, sortedIds) =>
  callAdmin('sortCategories', { menuId, sortedIds });
export const getOptionsByMenu = (menuId) =>
  callAdmin('getOptionsByMenu', { menuId });
export const upsertOption = (option) => callAdmin('upsertOption', { option });
export const deleteOption = (optionId) => callAdmin('deleteOption', { optionId });
export const getDishesByMenu = (menuId) => callAdmin('getDishesByMenu', { menuId });
export const getDishDetail = (dishId) => callAdmin('getDishDetail', { dishId });
export const upsertDish = (dish) => callAdmin('upsertDish', { dish });
export const deleteDish = (dishId) => callAdmin('deleteDish', { dishId });
export const sortDishes = (menuId, categoryId, sortedIds) =>
  callAdmin('sortDishes', { menuId, categoryId, sortedIds });
export const getMenuUsers = (menuId, params = {}) =>
  callAdmin('getMenuUsers', { menuId, ...params });
export const updateMenuUserRoles = (menuId, userId, roles) =>
  callAdmin('updateMenuUserRoles', { menuId, userId, roles });
export const createMenuInvite = (menuId, role = 'customer') =>
  callAdmin('createMenuInvite', { menuId, role });
export const acceptMenuInvite = (payload) => callAdmin('acceptMenuInvite', payload);

// Placeholders for yet-to-be-migrated features retain mock behaviour.
export const getCart = mockService.getCart;
export const updateCart = mockService.updateCart;
export const clearCart = mockService.clearCart;
export const submitOrder = mockService.submitOrder;
export const getOrdersByUser = mockService.getOrdersByUser;
export const getOrdersByMenu = mockService.getOrdersByMenu;
export const updateOrderStatus = mockService.updateOrderStatus;
export const getNotifications = mockService.getNotifications;
export const markNotificationSent = mockService.markNotificationSent;
export const duplicateOrder = mockService.duplicateOrder;
