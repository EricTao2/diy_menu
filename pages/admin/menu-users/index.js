import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getMenuUsers,
  updateMenuUserRoles,
  createMenuInvite,
  getMenusForCurrentUser,
} from '../../../services/api';
import { ensureRole } from '../../../utils/auth';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';

const app = getApp();
const store = app.getStore();

const PAGE_TRANSITION_DURATION = 180;
const ROLE_SEQUENCE = ['admin', 'chef', 'customer'];
const ROLE_LABELS = {
  admin: '管理员',
  chef: '厨师',
  customer: '顾客',
};

const ADMIN_TAB_URL_MAP = ADMIN_BOTTOM_TABS.reduce((acc, tab) => {
  acc[tab.key] = tab.url;
  return acc;
}, {});

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

const showActionSheet = (options) =>
  new Promise((resolve, reject) => {
    wx.showActionSheet({
      ...options,
      success: (res) => resolve(res),
      fail: (error) => {
        if (error && /cancel/.test(error.errMsg || '')) {
          resolve(null);
        } else {
          reject(error);
        }
      },
    });
  });

createPage({
  data: {
    users: [],
    total: 0,
    page: 1,
    pageSize: 20,
    loading: false,
    loadingMore: false,
    hasMore: false,
    sharePath: '',
    transitionClass: '',
    _shareExpiresAt: 0,
    _shareMenuName: '',
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
  },
  async onShow() {
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false;
    } else if (this.initialized) {
      await this.fetchUsers({ reset: true });
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
      await this.fetchUsers({ reset: true });
      this.initialized = true;
      this.skipNextShowRefresh = true;
    },
    async fetchUsers({ reset = false } = {}) {
      const state = store.getState();
      if (!state.activeMenuId) {
        return;
      }
      const nextPage = reset ? 1 : this.data.page + 1;
      const pageSize = this.data.pageSize;
      if (reset) {
        this.setData({ loading: true });
      } else {
        this.setData({ loadingMore: true });
      }
      try {
        const response = await getMenuUsers(state.activeMenuId, {
          page: nextPage,
          pageSize,
        });
        const {
          items = [],
          total = 0,
          page: responsePage,
          pageSize: responsePageSize,
          hasMore = false,
        } = response || {};
        const users = reset ? items : [...this.data.users, ...items];
        this.setData({
          users,
          total,
          page: responsePage || nextPage,
          pageSize: responsePageSize || pageSize,
          hasMore,
        });
      } catch (error) {
        console.error('加载菜单用户失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
        if (reset) {
          this.setData({ users: [], total: 0, page: 1, hasMore: false });
        }
      } finally {
        if (reset) {
          this.setData({ loading: false });
        } else {
          this.setData({ loadingMore: false });
        }
      }
    },
    onScrollToLower() {
      if (this.data.loading || this.data.loadingMore || !this.data.hasMore) {
        return;
      }
      this.fetchUsers({ reset: false });
    },
    async createInviteLink({ force = false } = {}) {
      const state = store.getState();
      if (!state.activeMenuId) {
        return null;
      }
      if (!force && this.data.sharePath) {
        return {
          path: this.data.sharePath,
          expiresAt: this.data._shareExpiresAt,
          menuName: this.data._shareMenuName,
        };
      }
      const invite = await createMenuInvite(state.activeMenuId, 'customer');
      const sharePath = invite.path || '';
      this.setData({
        sharePath,
        _shareExpiresAt: invite.expiresAt || 0,
        _shareMenuName: invite.menuName || '',
      });
      return invite;
    },
    async onEditUser(event) {
      const { userId } = event.currentTarget.dataset;
      if (!userId) {
        return;
      }
      const target = this.data.users.find((item) => item.userId === userId);
      if (!target) {
        return;
      }
      const options = ROLE_SEQUENCE.map((role) => {
        const hasRole = (target.roles || []).includes(role);
        return {
          role,
          hasRole,
          label: hasRole ? `移除${ROLE_LABELS[role]}` : `授予${ROLE_LABELS[role]}`,
        };
      });
      const sheet = await showActionSheet({
        itemList: options.map((option) => option.label),
      }).catch((error) => {
        if (error) {
          console.error('角色编辑失败', error);
        }
        return null;
      });
      if (!sheet || typeof sheet.tapIndex !== 'number') {
        return;
      }
      const choice = options[sheet.tapIndex];
      if (!choice) {
        return;
      }
      const nextRoles = new Set(target.roles || []);
      if (choice.hasRole) {
        if (choice.role === 'admin') {
          const adminCount = this.data.users.filter((user) => (user.roles || []).includes('admin')).length;
          if (adminCount <= 1) {
            wx.showToast({ title: '至少保留一名管理员', icon: 'none' });
            return;
          }
        }
        nextRoles.delete(choice.role);
      } else {
        nextRoles.add(choice.role);
      }
      await this.commitRoleChange(userId, Array.from(nextRoles));
    },
    async commitRoleChange(userId, roles) {
      const state = store.getState();
      if (!state.activeMenuId) {
        return;
      }
      wx.showLoading({ title: '保存中', mask: true });
      try {
        await updateMenuUserRoles(state.activeMenuId, userId, roles);
        await this.fetchUsers({ reset: true });
        await this.syncCurrentUserRoles();
        wx.showToast({ title: '已更新', icon: 'success' });
      } catch (error) {
        console.error('更新角色失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },
    async syncCurrentUserRoles() {
      const state = store.getState();
      const menus = await getMenusForCurrentUser().catch((error) => {
        console.error('刷新角色失败', error);
        return [];
      });
      const rolesByMenu = (menus || []).reduce((acc, menu) => {
        acc[menu.id] = menu.roles || [];
        return acc;
      }, {});
      let nextActiveRole = state.activeRole;
      if (state.activeMenuId) {
        const availableRoles = rolesByMenu[state.activeMenuId] || [];
        if (!availableRoles.includes(nextActiveRole)) {
          nextActiveRole = availableRoles[0] || null;
        }
      }
      store.setState({
        rolesByMenu,
        activeRole: nextActiveRole,
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
    onTabChange(event) {
      const { key } = event.detail || {};
      if (!key || key === 'menuUsers') {
        return;
      }
      const target = ADMIN_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
  },
  onReachBottom() {
    this.onScrollToLower();
  },
  onShareAppMessage() {
    const state = store.getState();
    if (!state.activeMenuId) {
      return {
        title: 'DIY菜单',
        path: '/pages/menu-selector/index',
      };
    }
    return this.createInviteLink({ force: true })
      .then((invite) => {
        const fallbackPath = `/pages/menu-selector/index?menuId=${state.activeMenuId}`;
        if (!invite) {
          return {
            title: '邀请加入菜单',
            path: fallbackPath,
          };
        }
        const title = invite.menuName
          ? `邀请你加入「${invite.menuName}」菜单`
          : '邀请你加入菜单';
        return {
          title,
          path: invite.path || fallbackPath,
        };
      })
      .catch((error) => {
        console.error('分享链接生成失败', error);
        return {
          title: 'DIY菜单',
          path: `/pages/menu-selector/index?menuId=${state.activeMenuId}`,
        };
      });
  },
});
