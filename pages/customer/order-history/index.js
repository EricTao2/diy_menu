import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getOrdersByUser, updateCart, getCart } from '../../../services/api';
import { formatCurrency, formatDateTime } from '../../../utils/format';
import { ensureRole } from '../../../utils/auth';
const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
  user: state.user,
});

const statusText = (status) => {
  switch (status) {
    case 'new':
      return '新订单';
    case 'processing':
      return '处理中';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
};

createPage({
  data: {
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
      if (!ensureRole(state, state.activeMenuId, 'customer')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      const orders = await getOrdersByUser(state.user.id, state.activeMenuId);
      this.setData({ rawOrders: orders }, () => this.formatOrders());
    },
    formatOrders() {
      const orders = (this.data.rawOrders || []).map((order) => ({
        ...order,
        totalPriceText: formatCurrency(order.totalPrice),
        createdAtText: formatDateTime(order.createdAt),
        statusText: statusText(order.status),
      }));
      this.setData({ orders });
    },
    async onReorder(event) {
      const { orderId } = event.detail;
      const state = store.getState();
      const order = (this.data.rawOrders || []).find((item) => item.id === orderId);
      if (!order) return;
      const cartItems = order.items.map((item) => ({
        dishId: item.dishId,
        name: item.name,
        quantity: item.quantity,
        priceSnapshot: item.unitPrice,
        optionsSnapshot: item.optionsSnapshot,
      }));
      await updateCart(state.activeMenuId, state.user.id, cartItems);
      await getCart(state.activeMenuId, state.user.id);
      wx.navigateTo({ url: '/pages/customer/cart/index' });
    },
    onView(event) {
      const { orderId } = event.detail;
      wx.navigateTo({ url: `/pages/common/order-detail/index?id=${orderId}` });
    },
  },
});
