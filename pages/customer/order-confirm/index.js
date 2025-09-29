import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getCart, submitOrder, getMenuDetail } from '../../../services/api';
import { formatCurrency } from '../../../utils/format';
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
    cart: null,
    menu: null,
    itemsView: [],
    totalText: '0.00',
    form: {
      remark: '',
      tableNo: '',
      pickupType: 'dine-in',
    },
    submitting: false,
  },
  mapStoreToData,
  async onLoad() {
    await this.loadData();
  },
  methods: {
    async loadData() {
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
      if (!cart.items.length) {
        wx.showToast({ title: '购物车为空，去菜单看看', icon: 'none' });
        wx.navigateBack();
        return;
      }
      const itemsView = cart.items.map((item) => ({
        ...item,
        priceText: formatCurrency(item.priceSnapshot),
        totalText: formatCurrency(item.priceSnapshot * item.quantity),
        options: item.optionsSnapshot
          ? Object.keys(item.optionsSnapshot).map((key) => ({
              label: key,
              value: item.optionsSnapshot[key],
            }))
          : [],
      }));
      const total = cart.items.reduce(
        (sum, item) => sum + (item.priceSnapshot || 0) * (item.quantity || 0),
        0
      );
      this.setData({ menu, cart, itemsView, totalText: formatCurrency(total) });
    },
    onInput(event) {
      const { field } = event.currentTarget.dataset;
      this.setData({ form: { ...this.data.form, [field]: event.detail.value } });
    },
    onPickupChange(event) {
      this.setData({ form: { ...this.data.form, pickupType: event.detail.value } });
    },
    async onSubmit() {
      if (this.data.submitting) return;
      this.setData({ submitting: true });
      try {
        const state = store.getState();
        const { cart, form } = this.data;
        const orderItems = cart.items.map((item) => ({
          dishId: item.dishId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.priceSnapshot,
          optionsSnapshot: item.optionsSnapshot,
        }));
        await submitOrder({
          menuId: state.activeMenuId,
          userId: state.user.id,
          items: orderItems,
          totalPrice: cart.items.reduce(
            (sum, item) => sum + item.priceSnapshot * item.quantity,
            0
          ),
          remark: form.remark,
          tableNo: form.tableNo,
          pickupType: form.pickupType,
        });
        wx.showToast({ title: '下单成功', icon: 'success' });
        wx.redirectTo({ url: '/pages/customer/order-history/index' });
      } catch (error) {
        console.error('提交订单失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      } finally {
        this.setData({ submitting: false });
      }
    },
  },
});
