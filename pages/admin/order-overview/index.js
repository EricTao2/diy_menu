import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getOrdersByMenu } from '../../../services/api';
import { ensureRole } from '../../../utils/auth';
import { formatCurrency, formatDateTime } from '../../../utils/format';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';
const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

const STATUS_SEQUENCE = ['new', 'processing', 'completed', 'cancelled'];
const STATUS_LABELS = {
  new: '已下单',
  processing: '处理中',
  completed: '已完成',
  cancelled: '已取消',
};

const PAGE_TRANSITION_DURATION = 180;

const ADMIN_TAB_URL_MAP = ADMIN_BOTTOM_TABS.reduce((acc, tab) => {
  acc[tab.key] = tab.url;
  return acc;
}, {});

createPage({
  data: {
    overview: null,
    statusDistribution: [],
    recentOrders: [],
    loading: false,
    transitionClass: '',
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
  },
  async onShow() {
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false;
    } else if (this.initialized) {
      await this.loadOrders();
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
      await this.loadOrders();
      this.initialized = true;
      this.skipNextShowRefresh = true;
    },
    async loadOrders() {
      const state = store.getState();
      if (!state.activeMenuId) {
        return;
      }
      this.setData({ loading: true });
      try {
        const orders = await getOrdersByMenu(state.activeMenuId, 'all');
        this.composeOverview(orders || []);
      } catch (error) {
        console.error('加载订单失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
        this.composeOverview([]);
      } finally {
        this.setData({ loading: false });
      }
    },
    composeOverview(orders) {
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
      const distributionCounts = STATUS_SEQUENCE.reduce((acc, key) => {
        acc[key] = 0;
        return acc;
      }, {});
      orders.forEach((order) => {
        if (distributionCounts[order.status] !== undefined) {
          distributionCounts[order.status] += 1;
        }
      });
      const statusDistribution = STATUS_SEQUENCE.map((status) => {
        const count = distributionCounts[status] || 0;
        const percent = totalOrders ? Math.round((count / totalOrders) * 100) : 0;
        return {
          status,
          label: STATUS_LABELS[status] || status,
          count,
          percent,
        };
      });
      const recentOrders = [...orders]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 5)
        .map((order) => ({
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          statusText: STATUS_LABELS[order.status] || order.status,
          totalPriceText: formatCurrency(order.totalPrice),
          createdAtText: formatDateTime(order.createdAt),
        }));
      this.setData({
        overview: {
          totalOrders,
          totalRevenueText: formatCurrency(totalRevenue),
        },
        statusDistribution,
        recentOrders,
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
      if (!key || key === 'orderOverview') {
        return;
      }
      const target = ADMIN_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
  },
});
