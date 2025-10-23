import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getOrdersByMenu,
  updateOrderStatus,
  getUnreadNotificationCount,
} from '../../../services/api';
import { ensureRole } from '../../../utils/auth';
import { CHEF_BOTTOM_TABS } from '../../../common/chef-tabs';

const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '已下单' },
  { key: 'processing', label: '处理中' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const CHEF_TAB_URL_MAP = CHEF_BOTTOM_TABS.reduce((acc, tab) => {
  if (tab?.key) {
    acc[tab.key] = tab.url;
  }
  return acc;
}, {});

createPage({
  data: {
    statusTabs: STATUS_TABS,
    activeStatus: 'all',
    rawOrders: [],
    orders: [],
    loading: false,
    chefTabs: CHEF_BOTTOM_TABS,
    unreadCount: 0,
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
  },
  async onShow() {
    if (this.initialized) {
      await Promise.all([this.loadOrders(), this.refreshUnreadCount()]);
    }
  },
  onUnload() {
    this.stopPolling();
  },
  methods: {
    async init() {
      const state = await this.ensureChefAccess();
      if (!state) {
        return;
      }
      this.initialized = true;
      await Promise.all([this.loadOrders(), this.refreshUnreadCount()]);
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

    async loadOrders() {
      const state = await this.ensureChefAccess();
      if (!state) {
        return;
      }
      if (this.data.loading) {
        return;
      }
      this.setData({ loading: true });
      try {
        const status = this.data.activeStatus && this.data.activeStatus !== 'all'
          ? this.data.activeStatus
          : null;
        const orders = await getOrdersByMenu(state.activeMenuId, status);
        this.setData({ rawOrders: orders || [] }, () => this.formatOrders());
      } catch (error) {
        console.error('加载订单失败', error);
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ rawOrders: [], orders: [] });
      } finally {
        this.setData({ loading: false });
      }
    },

    formatOrders() {
      const list = (this.data.rawOrders || []).map((order) => {
        let primaryAction = '';
        let secondaryAction = '';
        let showActions = false;
        if (order.status === 'new') {
          primaryAction = '接单';
          secondaryAction = '取消';
          showActions = true;
        } else if (order.status === 'processing') {
          primaryAction = '完成';
          secondaryAction = '取消';
          showActions = true;
        }
        return {
          ...order,
          statusText: this.getStatusText(order.status),
          actionText: primaryAction,
          secondaryActionText: secondaryAction,
          showActions,
        };
      });
      this.setData({ orders: list });
    },

    getStatusText(status) {
      switch (status) {
        case 'new':
          return '已下单';
        case 'processing':
          return '处理中';
        case 'completed':
          return '已完成';
        case 'cancelled':
          return '已取消';
        default:
          return status;
      }
    },

    onStatusChange(event) {
      const { status } = event.currentTarget.dataset;
      if (!status || status === this.data.activeStatus) {
        return;
      }
      this.setData({ activeStatus: status }, () => {
        this.loadOrders();
      });
    },

    async updateStatus(order, nextStatus) {
      if (!order || !nextStatus) {
        return;
      }
      if (nextStatus === 'cancelled') {
        const modal = await wx.showModal({
          title: '确认取消订单',
          content: `确定取消订单「${order.orderNo}」吗？`,
          confirmText: '取消订单',
          cancelText: '保留',
        });
        if (!modal.confirm) {
          return;
        }
      }
      const state = store.getState();
      wx.showLoading({ title: '提交中', mask: true });
      try {
        await updateOrderStatus(order.id, {
          status: nextStatus,
          handledBy: state?.user?.id,
        });
        wx.showToast({ title: '操作成功', icon: 'success' });
        await this.loadOrders();
      } catch (error) {
        console.error('更新订单状态失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },

    onPrimaryAction(event) {
      const { orderId } = event.detail || {};
      const order = (this.data.rawOrders || []).find((item) => item.id === orderId);
      if (!order) {
        return;
      }
      if (order.status === 'new') {
        this.updateStatus(order, 'processing');
      } else if (order.status === 'processing') {
        this.updateStatus(order, 'completed');
      }
    },

    onSecondaryAction(event) {
      const { orderId } = event.detail || {};
      const order = (this.data.rawOrders || []).find((item) => item.id === orderId);
      if (!order) {
        return;
      }
      if (order.status === 'new' || order.status === 'processing') {
        this.updateStatus(order, 'cancelled');
      }
    },

    onView(event) {
      const { orderId } = event.detail || {};
      if (orderId) {
        wx.navigateTo({ url: `/pages/chef/order-detail/index?id=${orderId}` });
      }
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
        console.error('获取通知数量失败', error);
      }
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
      if (!key || key === 'chefOrders') {
        return;
      }
      const target = CHEF_TAB_URL_MAP[key];
      if (target && target !== this.route) {
        wx.redirectTo({ url: target });
      }
    },
  },
});
