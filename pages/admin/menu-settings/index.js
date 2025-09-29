import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getMenuDetail,
  updateMenuSettings,
  getCategoriesByMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  sortCategories,
  deleteMenu,
} from '../../../services/api';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';
import { ensureRole } from '../../../utils/auth';
const app = getApp();
const store = app.getStore();
const themeManager = app.getThemeManager();

const PAGE_TRANSITION_DURATION = 180;

const ADMIN_TAB_URL_MAP = ADMIN_BOTTOM_TABS.reduce((acc, tab) => {
  acc[tab.key] = tab.url;
  return acc;
}, {});

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

createPage({
  data: {
    menu: null,
    form: {
      name: '',
      description: '',
      theme: 'light',
    },
    themeOptions: [],
    saving: false,
    categories: [],
    transitionClass: '',
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
  },
  async onShow() {
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false;
    } else if (this.initialized) {
      const { activeMenuId } = store.getState();
      if (activeMenuId) {
        await Promise.all([this.loadMenu(activeMenuId), this.loadCategories(activeMenuId)]);
      }
    }
    this.playEnterAnimation();
  },
  onUnload() {
    if (this.tabTransitionTimer) {
      clearTimeout(this.tabTransitionTimer);
    }
    if (this.enterTimer) {
      clearTimeout(this.enterTimer);
    }
  },
  methods: {
    async init() {
      const state = store.getState();
      if (!state.activeMenuId) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      if (!ensureRole(state, state.activeMenuId, 'admin')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      const themes = themeManager.getAvailableThemes();
      this.setData({
        themeOptions: themes,
      });
      await Promise.all([this.loadMenu(state.activeMenuId), this.loadCategories(state.activeMenuId)]);
      this.initialized = true;
      this.skipNextShowRefresh = true;
    },
    async loadMenu(menuId) {
      try {
        const menu = await getMenuDetail(menuId);
        this.setData({
          menu,
          form: {
            name: menu.name,
            description: menu.description,
            theme: menu.theme,
          },
        });
      } catch (error) {
        console.error('加载菜单设置失败', error);
      }
    },
    async loadCategories(menuId) {
      try {
        const categories = await getCategoriesByMenu(menuId);
        const sorted = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        this.setData({ categories: sorted });
      } catch (error) {
        console.error('加载分类失败', error);
      }
    },
    onInput(event) {
      const { field } = event.currentTarget.dataset;
      this.setData({
        form: {
          ...this.data.form,
          [field]: event.detail.value,
        },
      });
    },
    onThemeChange(event) {
      const { value } = event.detail;
      this.setData({
        form: { ...this.data.form, theme: value },
      });
    },
    async onSubmit() {
      const { form } = this.data;
      const { activeMenuId } = store.getState();
      if (!activeMenuId) return;
      this.setData({ saving: true });
      try {
        await updateMenuSettings(activeMenuId, form);
        store.setState({
          theme: form.theme,
        });
        themeManager.applyTheme(form.theme);
        wx.showToast({ title: '操作成功', icon: 'success' });
      } catch (error) {
        console.error('保存菜单设置失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      } finally {
        this.setData({ saving: false });
      }
    },
    onDeleteMenu() {
      const { activeMenuId, rolesByMenu } = store.getState();
      if (!activeMenuId) {
        return;
      }
      wx.showModal({
        title: '删除菜单',
        content: '删除后将移除该菜单及其所有分类与菜品，操作不可恢复。',
        confirmText: '删除',
        cancelText: '取消',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          wx.showLoading({ title: '删除中', mask: true });
          try {
            const success = await deleteMenu(activeMenuId);
            if (!success) {
              throw new Error('delete_failed');
            }
            const nextRoles = { ...(rolesByMenu || {}) };
            delete nextRoles[activeMenuId];
            store.setState({
              activeMenuId: null,
              activeRole: null,
              rolesByMenu: nextRoles,
            });
            wx.showToast({ title: '已删除', icon: 'success' });
            wx.redirectTo({ url: '/pages/menu-selector/index' });
          } catch (error) {
            console.error('删除菜单失败', error);
            wx.showToast({ title: '删除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        },
      });
    },
    playEnterAnimation() {
      if (this.tabTransitionTimer) {
        clearTimeout(this.tabTransitionTimer);
      }
      if (this.enterTimer) {
        clearTimeout(this.enterTimer);
      }
      this.setData({ transitionClass: 'page-enter' });
      this.enterTimer = setTimeout(() => {
        if (this.data.transitionClass === 'page-enter') {
          this.setData({ transitionClass: '' });
        }
      }, PAGE_TRANSITION_DURATION + 40);
    },
    onAddCategory() {
      const { activeMenuId } = store.getState();
      if (!activeMenuId) return;
      wx.showModal({
        title: '新增分类',
        editable: true,
        placeholderText: '输入分类名称',
        success: async (res) => {
          if (res.confirm) {
            const name = (res.content || '').trim();
            if (!name) return;
            try {
              await createCategory({ menuId: activeMenuId, name });
              wx.showToast({ title: '操作成功', icon: 'success' });
              await this.loadCategories(activeMenuId);
            } catch (error) {
              console.error('新增分类失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    onRenameCategory(event) {
      const { id } = event.currentTarget.dataset;
      if (!id) return;
      const category = this.data.categories.find((item) => item.id === id);
      if (!category) return;
      wx.showModal({
        title: '重命名分类',
        editable: true,
        placeholderText: category.name,
        success: async (res) => {
          if (res.confirm) {
            const name = (res.content || '').trim();
            if (!name || name === category.name) {
              return;
            }
            try {
              await updateCategory(id, { name });
              wx.showToast({ title: '操作成功', icon: 'success' });
              await this.loadCategories(store.getState().activeMenuId);
            } catch (error) {
              console.error('重命名分类失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    onDeleteCategory(event) {
      const { id } = event.currentTarget.dataset;
      if (!id) return;
      if (id === this.data.menu?.defaultCategoryId) {
        wx.showToast({ title: '默认分类不可删除', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '删除分类',
        content: '确认删除该分类？分类内菜品将移动至默认分类。',
        success: async (res) => {
          if (res.confirm) {
            try {
              await deleteCategory(id);
              wx.showToast({ title: '操作成功', icon: 'success' });
              await Promise.all([
                this.loadMenu(store.getState().activeMenuId),
                this.loadCategories(store.getState().activeMenuId),
              ]);
            } catch (error) {
              console.error('删除分类失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    async onMoveCategory(event) {
      const { id, direction } = event.currentTarget.dataset;
      const list = [...this.data.categories];
      const index = list.findIndex((item) => item.id === id);
      if (index === -1) return;
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= list.length) return;
      [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
      this.setData({ categories: list });
      try {
        const { activeMenuId } = store.getState();
        await sortCategories(activeMenuId, list.map((item) => item.id));
        wx.showToast({ title: '操作成功', icon: 'success' });
      } catch (error) {
        console.error('分类排序失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
        const { activeMenuId } = store.getState();
        if (activeMenuId) {
          await this.loadCategories(activeMenuId);
        }
      }
    },
    onTabChange(event) {
      const { key } = event.detail || {};
      if (!key || key === 'menuSettings') {
        return;
      }
      const target = ADMIN_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
  },
});
