import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getCart,
  submitOrder,
  getMenuDetail,
  getDishesByMenu,
  updateCart,
} from '../../../services/api';
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

const buildDishAvailability = (dish) => {
  if (!dish) return 'unavailable';
  if (dish.status !== 'on') return 'off';
  if (dish.stockStatus === 'soldOut' || dish.soldOut) return 'soldOut';
  return 'available';
};

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
      const [menu, cart, dishes] = await Promise.all([
        getMenuDetail(state.activeMenuId),
        getCart(state.activeMenuId, state.user.id),
        getDishesByMenu(state.activeMenuId),
      ]);
      if (!cart.items.length) {
        wx.showToast({ title: '购物车为空，去菜单看看', icon: 'none' });
        wx.navigateBack();
        return;
      }
      const dishMap = dishes.reduce((acc, dish) => {
        acc[dish.id] = dish;
        return acc;
      }, {});
      const availableItems = [];
      const removedItems = [];
      (cart.items || []).forEach((item) => {
        const dish = dishMap[item.dishId];
        const availability = buildDishAvailability(dish);
        if (availability !== 'available') {
          removedItems.push(item.name);
          return;
        }
        availableItems.push(item);
      });
      if (!availableItems.length) {
        wx.showModal({
          title: '提示',
          content: '菜品已失效，请重新点菜',
          showCancel: false,
        });
        await updateCart(state.activeMenuId, state.user.id, []);
        wx.navigateBack();
        return;
      }
      if (removedItems.length) {
        wx.showModal({
          title: '提示',
          content: '部分菜品已失效，已自动过滤',
          showCancel: false,
        });
        await updateCart(state.activeMenuId, state.user.id, availableItems);
      }
      const itemsView = availableItems.map((item) => ({
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
      const total = availableItems.reduce(
        (sum, item) => sum + (item.priceSnapshot || 0) * (item.quantity || 0),
        0
      );
      this.setData({
        menu,
        cart: { ...cart, items: availableItems },
        itemsView,
        totalText: formatCurrency(total),
      });
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
