import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getMenuDetail,
  getCategoriesByMenu,
  getDishesByMenu,
  getOptionsByMenu,
  getCart,
  updateCart,
} from '../../../services/api';
import { formatCurrency } from '../../../utils/format';
import { hasRole } from '../../../utils/auth';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';
const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
  user: state.user,
  roles: state.rolesByMenu[state.activeMenuId] || [],
  activeRole: state.activeRole,
});

const ROLE_LABELS = {
  admin: '管理员',
  chef: '厨师',
  customer: '顾客',
};

const SORT_MODES = [
  { value: 'default', label: '默认排序' },
  { value: 'priceAsc', label: '价格从低到高' },
  { value: 'priceDesc', label: '价格从高到低' },
];

const ADMIN_SHORTCUTS = ADMIN_BOTTOM_TABS.map((item) => ({ label: item.label, url: item.url }));

const CHEF_SHORTCUTS = [
  { label: '订单处理', url: '/pages/chef/order-list/index' },
];

createPage({
  data: {
    menu: null,
    rawCategories: [],
    rawDishes: [],
    displayCategories: [],
    optionsMap: {},
    cart: null,
    roles: [],
    activeRole: '',
    roleLabels: ROLE_LABELS,
    cartSummary: {
      itemCount: 0,
      totalPrice: 0,
      totalText: '0.00',
    },
    selectedDish: null,
    selectedOptions: {},
    selectedOptionLabels: {},
    selectedOptionList: [],
    selectedDishPrice: '',
    quantity: 1,
    showOptionModal: false,
    adminShortcuts: ADMIN_SHORTCUTS,
    chefShortcuts: CHEF_SHORTCUTS,
    searchKeyword: '',
    availableTags: [],
    activeTag: '',
    sortModes: SORT_MODES,
    activeSortIndex: 0,
    sortMode: SORT_MODES[0].value,
    categoryStates: {},
    hasResults: true,
  },
  mapStoreToData,
  async onLoad() {
    this._refreshOnShow = false;
    await this.loadData();
    this._refreshOnShow = true;
  },
  async onShow() {
    if (this._refreshOnShow) {
      await this.loadData();
    } else {
      this._refreshOnShow = true;
    }
  },
  methods: {
    async loadData() {
      const state = store.getState();
      if (!state.activeMenuId) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      const hasCustomerRole = hasRole(state, state.activeMenuId, 'customer');
      const hasAdminRole = hasRole(state, state.activeMenuId, 'admin');
      if (!hasCustomerRole && !hasAdminRole) {
        wx.showToast({ title: '操作失败', icon: 'none' });
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      const [menu, categories, dishes, options, cart] = await Promise.all([
        getMenuDetail(state.activeMenuId),
        getCategoriesByMenu(state.activeMenuId),
        getDishesByMenu(state.activeMenuId),
        getOptionsByMenu(state.activeMenuId),
        getCart(state.activeMenuId, state.user.id),
      ]);
      const optionsMap = options.reduce((acc, item) => {
        acc[item.id] = {
          ...item,
          choices: [...(item.choices || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
        };
        return acc;
      }, {});
      const categoryStates = { ...this.data.categoryStates };
      categories.forEach((category) => {
        if (!categoryStates[category.id]) {
          categoryStates[category.id] = { collapsed: false };
        }
      });
      this.setData(
        {
          menu,
          rawCategories: categories,
          rawDishes: dishes,
          optionsMap,
          cart,
          categoryStates,
        },
        () => {
          this.updateCartSummary();
          this.updateAvailableTags(dishes);
          this.rebuildCatalog();
        }
      );
    },
    updateCartSummary() {
      const { cart } = this.data;
      if (!cart) {
        this.setData({
          cartSummary: { itemCount: 0, totalPrice: 0, totalText: '0.00' },
        });
        return;
      }
      const itemCount = cart.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const totalPrice = cart.items.reduce(
        (sum, item) => sum + (item.priceSnapshot || 0) * (item.quantity || 0),
        0
      );
      this.setData({
        cartSummary: {
          itemCount,
          totalPrice,
          totalText: totalPrice.toFixed(2),
        },
      });
    },
    updateAvailableTags(dishes) {
      const tags = new Set();
      dishes.forEach((dish) => {
        (dish.tags || []).forEach((tag) => tags.add(tag));
      });
      const availableTags = Array.from(tags).sort((a, b) => a.localeCompare(b));
      this.setData({ availableTags });
    },
    rebuildCatalog() {
      const { rawCategories, rawDishes, searchKeyword, activeTag, categoryStates, sortMode } = this.data;
      const keyword = (searchKeyword || '').trim().toLowerCase();
      const filteredDishes = rawDishes.filter((dish) => {
        if (dish.status !== 'on') return false;
        const matchesTag = !activeTag || (dish.tags || []).includes(activeTag);
        const matchesKeyword = !keyword
          || `${dish.name || ''} ${(dish.description || '')} ${(dish.tags || []).join(' ')}`
            .toLowerCase()
            .includes(keyword);
        return matchesTag && matchesKeyword;
      });
      const displayCategories = rawCategories
        .map((category) => {
          const dishes = filteredDishes
            .filter((dish) => dish.categoryId === category.id)
            .sort((a, b) => {
              if (sortMode === 'priceAsc') {
                return (a.price || 0) - (b.price || 0);
              }
              if (sortMode === 'priceDesc') {
                return (b.price || 0) - (a.price || 0);
              }
              return (a.sortOrder || 0) - (b.sortOrder || 0);
            })
            .map((dish) => ({
              ...dish,
              priceText: formatCurrency(dish.price),
            }));
          return {
            ...category,
            collapsed: categoryStates[category.id]?.collapsed ?? false,
            dishes,
          };
        })
        .filter((category) => {
          if (keyword || activeTag) {
            return category.dishes.length > 0;
          }
          return true;
        });
      const hasResults = displayCategories.some((category) => category.dishes.length > 0);
      this.setData({ displayCategories, hasResults });
    },
    onSearchInput(event) {
      const keyword = event.detail.value || '';
      this.setData({ searchKeyword: keyword }, () => this.rebuildCatalog());
    },
    onClearSearch() {
      this.setData({ searchKeyword: '' }, () => this.rebuildCatalog());
    },
    onSelectTag(event) {
      const { tag } = event.currentTarget.dataset;
      const nextTag = tag === this.data.activeTag ? '' : tag;
      this.setData({ activeTag: nextTag }, () => this.rebuildCatalog());
    },
    onSortChange(event) {
      const index = Number(event.detail.value) || 0;
      const sortMode = this.data.sortModes[index]?.value || SORT_MODES[0].value;
      this.setData({ activeSortIndex: index, sortMode }, () => this.rebuildCatalog());
    },
    onToggleCategory(event) {
      const { id } = event.currentTarget.dataset;
      const categoryStates = { ...this.data.categoryStates };
      const prev = categoryStates[id]?.collapsed || false;
      categoryStates[id] = { collapsed: !prev };
      this.setData({ categoryStates }, () => this.rebuildCatalog());
    },
    onSelectDish(event) {
      if (this.data.activeRole !== 'customer') {
        wx.showToast({ title: '请切换到顾客身份以点餐', icon: 'none' });
        return;
      }
      const { dishId } = event.currentTarget.dataset;
      const dish = this.findDishById(dishId);
      if (!dish) return;
      const selections = {};
      const optionLabels = {};
      const optionList = [];
      (dish.optionIds || []).forEach((optionId) => {
        const option = this.data.optionsMap[optionId];
        if (option) {
          const defaultValue = option.defaultChoice || option.choices[0]?.value;
          selections[optionId] = defaultValue;
          const choice = option.choices.find((choiceItem) => choiceItem.value === defaultValue);
          optionLabels[optionId] = choice ? choice.label : '';
          optionList.push(option);
        }
      });
      this.setData({
        selectedDish: dish,
        selectedOptions: selections,
        selectedOptionLabels: optionLabels,
        selectedOptionList: optionList,
        selectedDishPrice: formatCurrency(dish.price),
        quantity: 1,
        showOptionModal: true,
      });
    },
    onCloseModal() {
      this.setData({ showOptionModal: false, selectedOptionList: [] });
    },
    onOptionChange(event) {
      const { selection } = event.detail;
      const optionLabels = { ...this.data.selectedOptionLabels };
      Object.keys(selection).forEach((optionId) => {
        const option = this.data.optionsMap[optionId];
        const choice = option?.choices?.find((item) => item.value === selection[optionId]);
        optionLabels[optionId] = choice ? choice.label : '';
      });
      this.setData({ selectedOptions: selection, selectedOptionLabels: optionLabels });
    },
    onQuantityChange(event) {
      const value = Number(event.detail.value) || 1;
      this.setData({ quantity: value < 1 ? 1 : value });
    },
    onNavigateToShortcut(event) {
      const { url } = event.currentTarget.dataset;
      if (!url) return;
      const isAdminTab = ADMIN_SHORTCUTS.some((item) => item.url === url);
      if (isAdminTab) {
        wx.switchTab({ url });
      } else {
        wx.navigateTo({ url });
      }
    },
    findDishById(dishId) {
      return this.data.rawDishes.find((item) => item.id === dishId) || null;
    },
    async onConfirmAdd() {
      const { selectedDish, selectedOptionLabels, quantity } = this.data;
      if (!selectedDish) return;
      const state = store.getState();
      const cart = this.data.cart ? { ...this.data.cart, items: [...this.data.cart.items] } : { items: [] };
      const existingIndex = cart.items.findIndex((item) =>
        item.dishId === selectedDish.id &&
        JSON.stringify(item.optionsSnapshot) === JSON.stringify(selectedOptionLabels)
      );
      if (existingIndex > -1) {
        cart.items[existingIndex].quantity += quantity;
      } else {
        cart.items.push({
          dishId: selectedDish.id,
          name: selectedDish.name,
          quantity,
          priceSnapshot: selectedDish.price,
          optionsSnapshot: selectedOptionLabels,
        });
      }
      const updatedCart = await updateCart(state.activeMenuId, state.user.id, cart.items);
      this.setData(
        {
          cart: updatedCart,
          showOptionModal: false,
          selectedOptionList: [],
        },
        () => this.updateCartSummary()
      );
      wx.showToast({ title: '操作成功', icon: 'success' });
    },
    onGoToCart() {
      wx.navigateTo({ url: '/pages/customer/cart/index' });
    },
    onSwitchRole(event) {
      const { role } = event.detail;
      const { activeRole, roles } = this.data;
      if (role === activeRole || !roles.includes(role)) {
        return;
      }
      store.setState({ activeRole: role });
      this.setData({ activeRole: role });
    },
  },
});
