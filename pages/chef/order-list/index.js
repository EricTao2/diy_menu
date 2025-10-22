import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getOrdersByMenu, updateOrderStatus } from '../../../services/api';
import { formatCurrency, formatDateTime } from '../../../utils/format';
import { ensureRole } from '../../../utils/auth';
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

createPage({
  data: {
    statusTabs: STATUS_TABS,
    activeStatus: 'all',
    orders: [],
  },
  mapStoreToData,
  async onLoad() {
    await this.loadOrders();
  },
  onShow() {
    this.loadOrders();
  },
  methods: {
    async loadOrders() {
      const state = store.getState();
      if (!state.activeMenuId) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      if (!ensureRole(state, state.activeMenuId, 'chef')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      const orders = await getOrdersByMenu(state.activeMenuId, this.data.activeStatus);
      this.setData({ rawOrders: orders }, () => this.formatOrders());
    },
    formatOrders() {
      const list = (this.data.rawOrders || []).map((order) => {
        let actionText = '';
        let secondaryActionText = '';
        let showActions = false;
        if (order.status === 'new') {
          actionText = '开始处理';
          showActions = true;
        } else if (order.status === 'processing') {
          actionText = '完成订单';
          secondaryActionText = '取消订单';
          showActions = true;
        }
        return {
          ...order,
          totalPriceText: formatCurrency(order.totalPrice),
          createdAtText: formatDateTime(order.createdAt),
          statusText: this.getStatusText(order.status),
          actionText,
          secondaryActionText,
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
    onTabChange(event) {
      const { status } = event.currentTarget.dataset;
      this.setData({ activeStatus: status }, () => this.loadOrders());
    },
    async updateStatus(orderId, status) {
      const state = store.getState();
      await updateOrderStatus(orderId, { status, handledBy: state.user.id });
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.loadOrders();
    },
    onMarkProcessing(event) {
      this.updateStatus(event.detail.orderId, 'processing');
    },
    onMarkComplete(event) {
      this.updateStatus(event.detail.orderId, 'completed');
    },
    onMarkCancel(event) {
      this.updateStatus(event.detail.orderId, 'cancelled');
    },
    onPrimaryAction(event) {
      const { orderId } = event.detail;
      const order = (this.data.rawOrders || []).find((item) => item.id === orderId);
      if (!order) return;
      if (order.status === 'new') {
        this.updateStatus(orderId, 'processing');
      } else if (order.status === 'processing') {
        this.updateStatus(orderId, 'completed');
      }
    },
    onSecondaryAction(event) {
      const { orderId } = event.detail;
      const order = (this.data.rawOrders || []).find((item) => item.id === orderId);
      if (!order) return;
      if (order.status === 'processing') {
        this.updateStatus(orderId, 'cancelled');
      }
    },
    onView(event) {
      const { orderId } = event.detail;
      wx.navigateTo({ url: `/pages/common/order-detail/index?id=${orderId}` });
    },
  },
});
