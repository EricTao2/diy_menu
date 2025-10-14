import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getCart, updateCart, clearCart, getMenuDetail } from '../../../services/api';
import { formatCurrency } from '../../../utils/format';
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

createPage({
  data: {
    cart: null,
    menu: null,
    itemsView: [],
    totalText: '0.00',
    customerTabs: CUSTOMER_BOTTOM_TABS,
  },
  mapStoreToData,
  async onLoad() {
    await this.loadCart();
  },
  onShow() {
    this.loadCart();
  },
  methods: {
    async loadCart() {
      const state = store.getState();
      if (!state.activeMenuId) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      if (!ensureRole(state, state.activeMenuId, 'customer')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      const [menu, cart] = await Promise.all([
        getMenuDetail(state.activeMenuId),
        getCart(state.activeMenuId, state.user.id),
      ]);
      this.setData({ menu, cart }, () => this.formatCart());
    },
    formatCart() {
      const { cart } = this.data;
      if (!cart) {
        this.setData({ itemsView: [], totalText: '0.00' });
        return;
      }
      const itemsView = cart.items.map((item, index) => ({
        ...item,
        index,
        priceText: formatCurrency(item.priceSnapshot),
        totalText: formatCurrency(item.priceSnapshot * item.quantity),
        options: item.optionsSnapshot ? Object.keys(item.optionsSnapshot).map((key) => ({
          label: key,
          value: item.optionsSnapshot[key],
        })) : [],
      }));
      const total = cart.items.reduce(
        (sum, item) => sum + (item.priceSnapshot || 0) * (item.quantity || 0),
        0
      );
      this.setData({ itemsView, totalText: formatCurrency(total) });
    },
    async onQuantityChange(event) {
      const { index } = event.currentTarget.dataset;
      const value = Number(event.detail.value) || 1;
      const quantity = value < 1 ? 1 : value;
      const cart = { ...this.data.cart };
      cart.items[index].quantity = quantity;
      const state = store.getState();
      const updated = await updateCart(state.activeMenuId, state.user.id, cart.items);
      this.setData({ cart: updated }, () => this.formatCart());
    },
    async onRemoveItem(event) {
      const { index } = event.currentTarget.dataset;
      const cart = { ...this.data.cart };
      cart.items.splice(index, 1);
      const state = store.getState();
      const updated = await updateCart(state.activeMenuId, state.user.id, cart.items);
      this.setData({ cart: updated }, () => this.formatCart());
    },
    async onClearCart() {
      const state = store.getState();
      await clearCart(state.activeMenuId, state.user.id);
      const cart = await getCart(state.activeMenuId, state.user.id);
      this.setData({ cart }, () => this.formatCart());
    },
    onSubmit() {
      if (!this.data.cart || !this.data.cart.items.length) {
        wx.showToast({ title: '购物车为空，去菜单看看', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: '/pages/customer/order-confirm/index' });
    },
    onTabChange(event) {
      const key = event?.detail?.key;
      if (!key || key === 'customerCart') {
        return;
      }
      const target = CUSTOMER_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
  },
});
