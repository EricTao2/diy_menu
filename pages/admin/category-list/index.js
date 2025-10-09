import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getCategoriesByMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  sortCategories,
  getMenuDetail,
} from '../../../services/api';
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
    categories: [],
    menu: null,
    newCategoryName: '',
    loading: false,
    transitionClass: '',
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
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
      this.setData({ loading: true });
      try {
        const [menu, categories] = await Promise.all([
          getMenuDetail(activeMenuId),
          getCategoriesByMenu(activeMenuId),
        ]);
        this.setData({ menu, categories });
      } catch (error) {
        console.error('加载分类失败', error);
      } finally {
        this.setData({ loading: false });
      }
    },
    onInput(event) {
      this.setData({ newCategoryName: event.detail.value });
    },
    async onAddCategory() {
      const name = this.data.newCategoryName.trim();
      if (!name) return;
      try {
        const category = await createCategory({
          menuId: this.data.menu.id,
          name,
        });
        this.setData({
          categories: [...this.data.categories, category],
          newCategoryName: '',
        });
        wx.showToast({ title: '操作成功', icon: 'success' });
      } catch (error) {
        console.error('新增分类失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },
    async onEditCategory(event) {
      const { id } = event.currentTarget.dataset;
      const category = this.data.categories.find((item) => item.id === id);
      if (!category) return;
      wx.showModal({
        title: '编辑',
        editable: true,
        placeholderText: category.name,
        success: async (res) => {
          if (res.confirm && res.content) {
            try {
              await updateCategory(id, { name: res.content });
              this.setData({
                categories: this.data.categories.map((item) =>
                  item.id === id ? { ...item, name: res.content } : item
                ),
              });
              wx.showToast({ title: '操作成功', icon: 'success' });
            } catch (error) {
              console.error('编辑分类失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    async onDeleteCategory(event) {
      const { id } = event.currentTarget.dataset;
      if (id === this.data.menu.defaultCategoryId) {
        wx.showToast({ title: '默认分类', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '删除',
        content: '确认',
        success: async (res) => {
          if (res.confirm) {
            try {
              await deleteCategory(id);
              this.setData({
                categories: this.data.categories.filter((item) => item.id !== id),
              });
              wx.showToast({ title: '操作成功', icon: 'success' });
            } catch (error) {
              console.error('删除分类失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    async onMove(event) {
      const { direction, id } = event.currentTarget.dataset;
      const list = [...this.data.categories];
      const index = list.findIndex((item) => item.id === id);
      if (index === -1) return;
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= list.length) return;
      [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
      this.setData({ categories: list });
      try {
        await sortCategories(this.data.menu.id, list.map((item) => item.id));
      } catch (error) {
        console.error('更新排序失败', error);
      }
    },
  },
});
