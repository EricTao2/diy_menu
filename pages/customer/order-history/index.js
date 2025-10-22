import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getOrdersByUser, updateCart, getCart, updateOrderStatus } from '../../../services/api';
import { formatCurrency, formatDateTime } from '../../../utils/format';
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

const statusText = (status) => {
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
};

createPage({
  data: {
    orders: [],
    customerTabs: CUSTOMER_BOTTOM_TABS,
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
      
      try {
        // 获取当前菜单的菜品信息，检查菜品是否仍然有效
        const { getDishesByMenu } = await import('../../../services/api');
        const dishes = await getDishesByMenu(state.activeMenuId);
        const dishMap = dishes.reduce((acc, dish) => {
          acc[dish.id] = dish;
          return acc;
        }, {});
        
        // 过滤掉已下架或已删除的菜品
        const validItems = [];
        const invalidItems = [];
        
        order.items.forEach((item) => {
          const dish = dishMap[item.dishId];
          if (dish && dish.status === 'active') {
            validItems.push({
              dishId: item.dishId,
              name: item.name,
              quantity: item.quantity,
              priceSnapshot: item.unitPrice,
              optionsSnapshot: item.optionsSnapshot,
            });
          } else {
            invalidItems.push(item.name);
          }
        });
        
        if (invalidItems.length > 0) {
          wx.showModal({
            title: '部分菜品已失效',
            content: `以下菜品已下架或删除，将自动过滤：\n${invalidItems.join('、')}`,
            showCancel: false,
            confirmText: '确定'
          });
        }
        
        if (validItems.length === 0) {
          wx.showToast({ title: '没有可用的菜品', icon: 'none' });
          return;
        }
        
        await updateCart(state.activeMenuId, state.user.id, validItems);
        await getCart(state.activeMenuId, state.user.id);
        wx.navigateTo({ url: '/pages/customer/cart/index' });
      } catch (error) {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },
    onView(event) {
      const { orderId } = event.detail;
      wx.navigateTo({ url: `/pages/common/order-detail/index?id=${orderId}` });
    },
    async onCancelOrder(event) {
      const { orderId } = event.detail;
      const order = (this.data.rawOrders || []).find((item) => item.id === orderId);
      if (!order) return;
      
      // 只有新订单可以取消
      if (order.status !== 'new') {
        wx.showToast({ title: '该订单无法取消', icon: 'none' });
        return;
      }
      
      wx.showModal({
        title: '确认取消',
        content: '确定要取消这个订单吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await updateOrderStatus(orderId, { status: 'cancelled' });
              wx.showToast({ title: '订单已取消', icon: 'success' });
              await this.loadOrders();
            } catch (error) {
              wx.showToast({ title: '取消失败', icon: 'none' });
            }
          }
        }
      });
    },
    onTabChange(event) {
      const key = event?.detail?.key;
      if (!key || key === 'customerOrders') {
        return;
      }
      const target = CUSTOMER_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
  },
});
