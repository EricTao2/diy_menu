import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { 
  getNotifications, 
  markNotificationRead, 
  markAllNotificationsRead,
  getUnreadNotificationCount 
} from '../../../services/api';
import { formatDateTime } from '../../../utils/format';
import { ensureRole } from '../../../utils/auth';
import { CUSTOMER_BOTTOM_TABS } from '../../../common/customer-tabs';

const CUSTOMER_TAB_URL_MAP = CUSTOMER_BOTTOM_TABS.reduce((acc, tab) => {
  if (tab?.key) {
    acc[tab.key] = tab.url;
  }
  return acc;
}, {});

const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
  user: state.user,
});

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

createPage({
  data: {
    notifications: [],
    unreadCount: 0,
    loading: false,
    refreshing: false,
    hasMore: true,
    page: 1,
    customerTabs: CUSTOMER_BOTTOM_TABS,
    pollingTimer: null,
  },
  mapStoreToData,
  async onLoad() {
    await this.loadNotifications();
    await this.loadUnreadCount();
    this.startPolling();
  },
  async onShow() {
    await this.loadNotifications();
    await this.loadUnreadCount();
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
    async loadNotifications(refresh = false) {
      const state = store.getState();
      if (!state.activeMenuId) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      if (!ensureRole(state, state.activeMenuId, 'customer')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }

      if (this.data.loading) return;
      
      this.setData({ loading: true });
      
      try {
        const page = refresh ? 1 : this.data.page;
        const result = await getNotifications(state.activeMenuId, null, null, page, 20);
        
        const notifications = result.items.map(notification => ({
          ...notification,
          typeText: getNotificationTypeText(notification.type),
          icon: getNotificationIcon(notification.type),
          createdAtText: formatDateTime(notification.createdAt),
        }));

        this.setData({
          notifications: refresh ? notifications : [...this.data.notifications, ...notifications],
          hasMore: result.hasMore,
          page: refresh ? 2 : this.data.page + 1,
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
      this.setData({ refreshing: true, page: 1 });
      await this.loadNotifications(true);
    },

    async loadMoreNotifications() {
      if (!this.data.hasMore || this.data.loading) return;
      await this.loadNotifications();
    },

    async loadUnreadCount() {
      const state = store.getState();
      if (!state.activeMenuId) return;
      
      try {
        const count = await getUnreadNotificationCount(state.activeMenuId);
        this.setData({ unreadCount: count });
      } catch (error) {
        console.error('获取未读通知数量失败', error);
      }
    },

    async onNotificationTap(event) {
      const { notificationId } = event.detail;
      const notification = this.data.notifications.find(n => n.id === notificationId);
      
      if (!notification) return;

      // 标记为已读
      if (!notification.read) {
        try {
          await markNotificationRead(notificationId);
          this.updateNotificationReadStatus(notificationId);
        } catch (error) {
          console.error('标记通知已读失败', error);
        }
      }

      // 跳转到相关页面
      if (notification.type === 'order:new' || notification.type === 'order:status_changed') {
        const orderId = notification.payload?.orderId;
        if (orderId) {
          wx.navigateTo({
            url: `/pages/common/order-detail/index?id=${orderId}`
          });
        }
      }
    },

    async onMarkAllRead() {
      const state = store.getState();
      try {
        await markAllNotificationsRead(state.activeMenuId);
        this.setData({
          notifications: this.data.notifications.map(n => ({ ...n, read: true })),
          unreadCount: 0,
        });
        wx.showToast({ title: '已全部标记为已读', icon: 'success' });
      } catch (error) {
        console.error('标记全部已读失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },

    updateNotificationReadStatus(notificationId) {
      this.setData({
        notifications: this.data.notifications.map(n => 
          n.id === notificationId ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, this.data.unreadCount - 1),
      });
    },

    startPolling() {
      // 每10秒轮询一次未读通知数量
      this.data.pollingTimer = setInterval(async () => {
        const state = store.getState();
        if (state.activeMenuId) {
          try {
            const count = await getUnreadNotificationCount(state.activeMenuId);
            this.setData({ unreadCount: count });
          } catch (error) {
            console.error('轮询通知数量失败', error);
          }
        }
      }, 10000);
    },

    stopPolling() {
      if (this.data.pollingTimer) {
        clearInterval(this.data.pollingTimer);
        this.setData({ pollingTimer: null });
      }
    },

    onTabChange(event) {
      const { key } = event.detail;
      const url = CUSTOMER_TAB_URL_MAP[key];
      if (url && url !== this.route) {
        wx.redirectTo({ url });
      }
    },
  },
});
