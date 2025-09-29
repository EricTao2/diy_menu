import { createPage } from '../../utils/page';
import { resolveThemeClass } from '../../utils/theme-helper';
import { getCurrentUser, getMenusForCurrentUser, createMenu } from '../../services/api';

const app = getApp();
const store = app.getStore();
const themeManager = app.getThemeManager();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
});

const ROLE_LABELS = {
  admin: '管理员',
  chef: '厨师',
  customer: '顾客',
};

const ROLE_ENTRY_PAGES = {
  admin: '/pages/admin/menu-designer/index',
  chef: '/pages/chef/order-list/index',
  customer: '/pages/customer/menu/index',
};

createPage({
  data: {
    loading: false,
    menus: [],
    selectedMenuId: '',
    selectedRole: '',
    roleLabels: ROLE_LABELS,
    user: null,
  },
  mapStoreToData,
  async onLoad() {
    await this.loadData();
  },
  methods: {
    async loadData(preferredMenuId = '', preferredRole = '') {
      this.setData({ loading: true });
      try {
        const [user, menus] = await Promise.all([
          getCurrentUser(),
          getMenusForCurrentUser(),
        ]);
        const defaultMenu = preferredMenuId
          ? menus.find((item) => item.id === preferredMenuId) || menus[0] || null
          : menus[0] || null;
        let defaultRole = '';
        if (defaultMenu) {
          const availableRoles = defaultMenu.roles || [];
          if (preferredRole && availableRoles.includes(preferredRole)) {
            defaultRole = preferredRole;
          } else {
            defaultRole = availableRoles[0] || '';
          }
        }
        const rolesByMenu = menus.reduce((acc, menu) => {
          acc[menu.id] = menu.roles;
          return acc;
        }, {});
        store.setState({
          user,
          rolesByMenu,
        });
        this.setData({
          user,
          menus,
          selectedMenuId: defaultMenu ? defaultMenu.id : '',
          selectedRole: defaultRole,
        });
        return menus;
      } catch (error) {
        console.error('加载菜单失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
        return null;
      } finally {
        this.setData({ loading: false });
      }
    },
    async onCreateMenu() {
      if (this.data.loading) {
        return;
      }
      const res = await wx.showModal({
        title: '创建菜单',
        editable: true,
        placeholderText: '请输入菜单名称',
        confirmText: '创建',
        cancelText: '取消',
      });
      if (!res.confirm) {
        return;
      }
      const name = typeof res.content === 'string' ? res.content.trim() : '';
      if (!name) {
        wx.showToast({ title: '请输入菜单名称', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '创建中', mask: true });
      try {
        const menu = await createMenu({ name });
        wx.showToast({ title: '创建成功', icon: 'success' });
        await this.loadData(menu.id, 'admin');
      } catch (error) {
        console.error('创建菜单失败', error);
        wx.showToast({ title: '创建失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },
    onSelectMenu(event) {
      const { menuId } = event.currentTarget.dataset;
      const menu = this.data.menus.find((item) => item.id === menuId);
      this.setData({
        selectedMenuId: menuId,
        selectedRole: menu?.roles[0] || '',
      });
    },
    onSwitchRole(event) {
      const { role } = event.detail;
      const { menuId } = event.currentTarget.dataset;
      if (menuId !== this.data.selectedMenuId) {
        return;
      }
      this.setData({ selectedRole: role });
    },
    onEnter() {
      const { selectedMenuId, selectedRole } = this.data;
      if (!selectedMenuId || !selectedRole) {
        wx.showToast({ title: '请选择菜单和身份', icon: 'none' });
        return;
      }
      const menu = this.data.menus.find((item) => item.id === selectedMenuId);
      if (!menu) {
        wx.showToast({ title: '操作失败', icon: 'none' });
        return;
      }
      store.setState({
        activeMenuId: menu.id,
        activeRole: selectedRole,
        theme: menu.theme,
      });
      themeManager.applyTheme(menu.theme);
      const targetUrl = ROLE_ENTRY_PAGES[selectedRole];
      if (!targetUrl) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      wx.redirectTo({ url: targetUrl });
    },
  },
});
