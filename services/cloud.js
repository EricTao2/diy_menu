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

// Cart functions migrated to cloud functions
export const getCart = (menuId, userId) => callAdmin('getCart', { menuId, userId });
export const updateCart = (menuId, userId, items) => callAdmin('updateCart', { menuId, userId, items });
export const clearCart = (menuId, userId) => callAdmin('clearCart', { menuId, userId });

// Order functions migrated to cloud functions
export const submitOrder = (payload) => callAdmin('submitOrder', payload);
export const getOrdersByUser = (userId, menuId) => callAdmin('getOrdersByUser', { userId, menuId });
export const getOrdersByMenu = (menuId, status = null) => callAdmin('getOrdersByMenu', { menuId, status });
export const updateOrderStatus = (orderId, updates) => callAdmin('updateOrderStatus', { orderId, ...updates });
export const duplicateOrder = (orderId) => callAdmin('duplicateOrder', { orderId });

// Notification functions migrated to cloud functions
export const getNotifications = (menuId, type = null, status = null, page = 1, pageSize = 20) => callAdmin('getNotifications', { menuId, type, status, page, pageSize });
export const markNotificationSent = (notificationId) => callAdmin('markNotificationSent', { notificationId });
export const markNotificationRead = (notificationId) => callAdmin('markNotificationRead', { notificationId });
export const markAllNotificationsRead = (menuId) => callAdmin('markAllNotificationsRead', { menuId });
export const getUnreadNotificationCount = (menuId) => callAdmin('getUnreadNotificationCount', { menuId });

// Order detail function
export const getOrderDetail = (orderId) => callAdmin('getOrderDetail', { orderId });

// Recipe functions
export const getRecipes = () => callAdmin('getRecipes');
export const getRecipeById = (recipeId) => callAdmin('getRecipeById', { recipeId });
export const createRecipe = (payload) => callAdmin('createRecipe', payload);
export const updateRecipe = (recipeId, updates) => callAdmin('updateRecipe', { recipeId, ...updates });
export const deleteRecipe = (recipeId) => callAdmin('deleteRecipe', { recipeId });

// Ingredient functions
export const getIngredients = () => callAdmin('getIngredients');
export const createIngredient = (payload) => callAdmin('createIngredient', payload);
export const updateIngredient = (ingredientId, updates) => callAdmin('updateIngredient', { ingredientId, ...updates });
export const deleteIngredient = (ingredientId) => callAdmin('deleteIngredient', { ingredientId });
