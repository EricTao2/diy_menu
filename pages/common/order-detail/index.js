import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getOrdersByMenu } from '../../../services/api';
import { formatCurrency, formatDateTime } from '../../../utils/format';
const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
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
    order: null,
  },
  mapStoreToData,
  async onLoad(query) {
    this.orderId = query?.id || '';
    await this.loadOrder();
  },
  methods: {
    async loadOrder() {
      const state = store.getState();
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
        statusText: statusText(this.rawOrder.status),
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
      this.setData({ order });
    },
  },
});
