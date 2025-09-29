import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getDishesByMenu,
  getCategoriesByMenu,
  upsertDish,
  deleteDish,
  sortDishes,
} from '../../../services/api';
import { formatCurrency } from '../../../utils/format';
import { ensureRole } from '../../../utils/auth';
const app = getApp();
const store = app.getStore();
const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

createPage({
  data: {
    dishes: [],
    categories: [],
    filteredDishes: [],
    selectedCategoryId: '',
    selectedCategoryName: '',
    categoryPickerRange: [],
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
  },
  onShow() {
    this.init();
  },
  methods: {
    async init() {
      const state = store.getState();
      const { activeMenuId } = state;
      if (!activeMenuId) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      if (!ensureRole(state, activeMenuId, 'admin')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      const [categories, dishes] = await Promise.all([
        getCategoriesByMenu(activeMenuId),
        getDishesByMenu(activeMenuId),
      ]);
      this.setData({ categories, dishes }, () => {
        this.updateCategoryPicker();
        this.applyFilter();
      });
    },
    applyFilter() {
      const { dishes, selectedCategoryId, categories } = this.data;
      const categoryMap = categories.reduce((acc, category) => {
        acc[category.id] = category.name;
        return acc;
      }, {});
      let filtered = dishes;
      if (selectedCategoryId) {
        filtered = dishes.filter((dish) => dish.categoryId === selectedCategoryId);
      }
      const formatted = filtered.map((dish) => ({
        ...dish,
        priceText: formatCurrency(dish.price, '¥'),
        categoryName: categoryMap[dish.categoryId] || '',
      }));
      const selectedCategoryName = selectedCategoryId
        ? categoryMap[selectedCategoryId] || ''
        : '全部';
      this.setData({ filteredDishes: formatted, selectedCategoryName });
    },
    onCategoryPickerChange(event) {
      const index = event.detail.value;
      const categoryId = Number(index) === 0 ? '' : this.data.categories[index - 1].id;
      this.setData({ selectedCategoryId: categoryId }, () => this.applyFilter());
    },
    onAddDish() {
      wx.navigateTo({ url: '/pages/admin/dish-edit/index' });
    },
    onEditDish(event) {
      const { id } = event.currentTarget.dataset;
      wx.navigateTo({ url: `/pages/admin/dish-edit/index?id=${id}` });
    },
    async onToggleStatus(event) {
      const { id } = event.currentTarget.dataset;
      const dish = this.data.dishes.find((item) => item.id === id);
      if (!dish) return;
      const nextStatus = dish.status === 'on' ? 'off' : 'on';
      try {
        await upsertDish({ ...dish, status: nextStatus });
        this.setData({
          dishes: this.data.dishes.map((item) =>
            item.id === id ? { ...item, status: nextStatus } : item
          ),
        }, () => this.applyFilter());
      } catch (error) {
        console.error('更新状态失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },
    async onDeleteDish(event) {
      const { id } = event.currentTarget.dataset;
      wx.showModal({
        title: '删除',
        content: '确认',
        success: async (res) => {
          if (res.confirm) {
            try {
              await deleteDish(id);
              this.setData({
                dishes: this.data.dishes.filter((item) => item.id !== id),
              }, () => this.applyFilter());
              wx.showToast({ title: '操作成功', icon: 'success' });
            } catch (error) {
              console.error('删除菜品失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    async onMove(event) {
      const { id, direction } = event.currentTarget.dataset;
      const categoryId = this.data.dishes.find((item) => item.id === id)?.categoryId;
      if (!categoryId) return;
      const categoryDishes = this.data.dishes
        .filter((item) => item.categoryId === categoryId)
        .map((item) => item.id);
      const orderedIds = [...categoryDishes];
      const index = orderedIds.indexOf(id);
      if (index === -1) return;
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= orderedIds.length) return;
      [orderedIds[index], orderedIds[swapIndex]] = [orderedIds[swapIndex], orderedIds[index]];
      const { activeMenuId } = store.getState();
      await sortDishes(activeMenuId, categoryId, orderedIds);
      const dishes = await getDishesByMenu(activeMenuId);
      this.setData({ dishes }, () => this.applyFilter());
    },
    updateCategoryPicker() {
      const range = ['全部', ...this.data.categories.map((item) => item.name)];
      this.setData({ categoryPickerRange: range });
    },
  },
});
