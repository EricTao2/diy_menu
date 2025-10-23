import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
} from '../../../services/api';
import { formatDateTime } from '../../../utils/format';
import { ensureRole } from '../../../utils/auth';
import { CHEF_BOTTOM_TABS } from '../../../common/chef-tabs';

const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

const STATUS_TEXT_MAP = {
  new: '已下单',
  processing: '处理中',
  completed: '已完成',
  cancelled: '已取消',
};

const getNotificationTypeText = (type) => {
  switch (type) {
    case 'order:new':
      return '新订单';
    case 'order:status_changed':
      return '订单状态变更';
    default:
      return '系统通知';
  }
};

const getNotificationIcon = (type) => {
  switch (type) {
    case 'order:new':
      return '🔔';
    case 'order:status_changed':
      return '📋';
    default:
      return '📢';
  }
};

const CHEF_TAB_URL_MAP = CHEF_BOTTOM_TABS.reduce((acc, tab) => {
  if (tab?.key) {
    acc[tab.key] = tab.url;
  }
  return acc;
}, {});

createPage({
  data: {
    notifications: [],
    unreadCount: 0,
    loading: false,
    refreshing: false,
    hasMore: true,
    page: 1,
    chefTabs: CHEF_BOTTOM_TABS,
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
  },
  async onShow() {
    if (this.initialized) {
      await Promise.all([this.loadNotifications(true), this.refreshUnreadCount()]);
    }
  },
  onUnload() {
    this.stopPolling();
  },
  onPullDownRefresh() {
    this.refreshNotifications();
  },
  onReachBottom() {
    this.loadMoreNotifications();
  },
  methods: {
    async init() {
      const state = await this.ensureChefAccess();
      if (!state) {
        return;
      }
      this.initialized = true;
      await Promise.all([this.loadNotifications(true), this.refreshUnreadCount()]);
      this.startPolling();
    },

    async ensureChefAccess() {
      const state = store.getState();
      if (!state.activeMenuId) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return null;
      }
      if (!ensureRole(state, state.activeMenuId, 'chef')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return null;
      }
      return state;
    },

    async loadNotifications(refresh = false) {
      const state = await this.ensureChefAccess();
      if (!state) {
        return;
      }
      if (this.data.loading) {
        return;
      }

      this.setData({ loading: true });

      try {
        const page = refresh ? 1 : this.data.page;
        const result = await getNotifications(state.activeMenuId, null, null, page, 20);
        const notifications = (result.items || []).map((notification) => {
          const payload = notification.payload || {};
          const rawStatus =
            payload.status || (notification.type === 'order:new' ? 'new' : '');
          const statusText = rawStatus ? STATUS_TEXT_MAP[rawStatus] || rawStatus : '';
          let message = payload.message || '系统通知';
          if (notification.type === 'order:new') {
            message = '您有新的订单需要处理';
          } else if (notification.type === 'order:status_changed') {
            message = statusText
              ? `订单状态更新为：${statusText}`
              : '订单状态已更新';
          }

          return {
            ...notification,
            typeText: getNotificationTypeText(notification.type),
            icon: getNotificationIcon(notification.type),
            createdAtText: formatDateTime(notification.createdAt),
            orderNo: payload.orderNo || '',
            statusText,
            message,
          };
        });

        this.setData({
          notifications: refresh ? notifications : [...this.data.notifications, ...notifications],
          hasMore: !!result.hasMore,
          page: refresh ? 2 : page + 1,
        });

        if (refresh) {
          wx.stopPullDownRefresh();
        }
      } catch (error) {
        console.error('加载通知失败', error);
        wx.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.setData({ loading: false, refreshing: false });
      }
    },

    async refreshNotifications() {
      this.setData({ refreshing: true, page: 1, hasMore: true });
      await this.loadNotifications(true);
    },

    async loadMoreNotifications() {
      if (!this.data.hasMore || this.data.loading) {
        return;
      }
      await this.loadNotifications(false);
    },

    async refreshUnreadCount() {
      const state = store.getState();
      if (!state.activeMenuId) {
        return;
      }
      try {
        const count = await getUnreadNotificationCount(state.activeMenuId);
        this.setData({ unreadCount: count });
      } catch (error) {
        console.error('获取未读通知数量失败', error);
      }
    },

    async onNotificationTap(event) {
      const { notificationId } = event.detail || {};
      const notification = (this.data.notifications || []).find((item) => item.id === notificationId);
      if (!notification) {
        return;
      }

      if (!notification.read) {
        try {
          await markNotificationRead(notificationId);
          this.updateNotificationReadStatus(notificationId);
        } catch (error) {
          console.error('标记通知已读失败', error);
        }
      }

      if ((notification.type === 'order:new' || notification.type === 'order:status_changed') && notification.payload?.orderId) {
        wx.navigateTo({
          url: `/pages/chef/order-detail/index?id=${notification.payload.orderId}`,
        });
      }
    },

    async onMarkAllRead() {
      const state = store.getState();
      if (!state.activeMenuId) {
        return;
      }
      try {
        await markAllNotificationsRead(state.activeMenuId);
        this.setData({
          notifications: this.data.notifications.map((item) => ({ ...item, read: true })),
          unreadCount: 0,
        });
        wx.showToast({ title: '已全部标记为已读', icon: 'success' });
      } catch (error) {
        console.error('标记全部通知失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },

    updateNotificationReadStatus(notificationId) {
      this.setData({
        notifications: this.data.notifications.map((item) =>
          item.id === notificationId ? { ...item, read: true } : item
        ),
        unreadCount: Math.max(0, this.data.unreadCount - 1),
      });
    },

    startPolling() {
      this.stopPolling();
      this.pollingTimer = setInterval(() => {
        this.refreshUnreadCount();
      }, 10000);
    },

    stopPolling() {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
    },

    onBottomTabChange(event) {
      const { key } = event.detail || {};
      if (!key || key === 'chefNotifications') {
        return;
      }
      const target = CHEF_TAB_URL_MAP[key];
      if (target && target !== this.route) {
        wx.redirectTo({ url: target });
      }
    },
  },
});
