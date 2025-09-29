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
  user: state.user,
});

createPage({
  data: {
    order: null,
    handledRemark: '',
  },
  mapStoreToData,
  async onLoad(query) {
    if (query?.id) {
      this.orderId = query.id;
      await this.loadOrder();
    }
  },
  methods: {
    async loadOrder() {
      const state = store.getState();
      if (!ensureRole(state, state.activeMenuId, 'chef')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      const orders = await getOrdersByMenu(state.activeMenuId, 'all');
      const order = orders.find((item) => item.id === this.orderId);
      if (!order) {
        wx.showToast({ title: 'Not Found', icon: 'none' });
        wx.navigateBack();
        return;
      }
      this.rawOrder = order;
      this.formatOrder();
    },
    formatOrder() {
      if (!this.rawOrder) return;
      const order = {
        ...this.rawOrder,
        totalPriceText: formatCurrency(this.rawOrder.totalPrice),
        createdAtText: formatDateTime(this.rawOrder.createdAt),
        statusText: this.statusText(this.rawOrder.status),
        items: this.rawOrder.items.map((item) => ({
          ...item,
          totalText: formatCurrency(item.unitPrice * item.quantity),
          options: item.optionsSnapshot
            ? Object.keys(item.optionsSnapshot).map((key) => ({
                label: key,
                value: item.optionsSnapshot[key],
              }))
            : [],
        })),
      };
      this.setData({
        order,
        handledRemark: this.rawOrder.handledRemark || '',
      });
    },
    statusText(status) {
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
    },
    async updateStatus(status = null) {
      if (!this.rawOrder) return;
      const payload = {
        handledBy: store.getState().user.id,
        handledRemark: this.data.handledRemark,
      };
      if (status) {
        payload.status = status;
      }
      await updateOrderStatus(this.rawOrder.id, payload);
      wx.showToast({ title: '操作成功', icon: 'success' });
      await this.loadOrder();
    },
    onRemarkInput(event) {
      this.setData({ handledRemark: event.detail.value });
    },
    onSaveRemark() {
      this.updateStatus();
    },
    onMarkProcessing() {
      this.updateStatus('processing');
    },
    onMarkComplete() {
      this.updateStatus('completed');
    },
    onMarkCancel() {
      this.updateStatus('cancelled');
    },
  },
});
