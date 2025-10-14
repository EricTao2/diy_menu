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
import { CUSTOMER_BOTTOM_TABS } from '../../../common/customer-tabs';

const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
  user: state.user,
  activeRole: state.activeRole,
  roles: state.rolesByMenu[state.activeMenuId] || [],
});

const ROLE_LABELS = {
  admin: '管理员',
  chef: '厨师',
  customer: '顾客',
};

const CUSTOMER_TAB_URL_MAP = CUSTOMER_BOTTOM_TABS.reduce((acc, tab) => {
  if (tab?.key) {
    acc[tab.key] = tab.url;
  }
  return acc;
}, {});

const MENU_COLUMN_MIN_HEIGHT_RPX = 520;
const SCROLL_UNLOCK_THRESHOLD = 16;
const FLOATING_BUTTON_HEIGHT_RPX = 0;
const COLUMN_UNLOCK_THRESHOLD = 4;
const LOCK_CONTAINER_VERTICAL_PADDING_RPX = 100;
const ADMIN_TABBAR_HEIGHT_RPX = 160;
const GESTURE_DEADZONE = 6;
const BRIDGE_SCROLL_INTERVAL = 18;
const RIGHT_GROUP_ANCHOR_OFFSET_RPX = 40;
const PIN_TRIGGER_OFFSET_RPX = 200;

const normalizePrice = (value) => Number(value || 0);

createPage({
  data: {
    loading: true,
    menu: null,
    categories: [],
    dishGroups: [],
    activeCategoryId: '',
    optionsMap: {},
    customerTabs: CUSTOMER_BOTTOM_TABS,
    isPinned: false,
    pageStyle: '',
    catalogStyle: '',
    catalogViewportHeight: 0,
    innerScrollEnabled: false,
    leftScrollTop: null,
    rightScrollTop: null,
    rightIntoView: '',
    cart: null,
    cartSummary: {
      itemCount: 0,
      totalPrice: 0,
      totalText: '0.00',
    },
    selectedDish: null,
    selectedOptionList: [],
    selectedOptions: {},
    selectedOptionLabels: {},
    showOptionModal: false,
    quantity: 1,
    selectedDishPriceText: '',
    roleLabels: ROLE_LABELS,
    heroImage: '',
    heroTitle: '',
    heroDescription: '',
    stickyPaddingBottom: 0,
    stickyPinnedPaddingBottom: 0,
  },
  mapStoreToData,
  onPageScroll(event) {
    if (typeof this.handlePageScroll === 'function') {
      this.handlePageScroll(event || {});
    }
  },
  async onLoad() {
    await this.initPage();
  },
  async onShow() {
    if (this.skipNextRefresh) {
      this.skipNextRefresh = false;
      return;
    }
    if (this.hasLoaded) {
      await this.loadMenuData();
    }
  },
  onUnload() {
    if (this.sentinelObserver) {
      this.sentinelObserver.disconnect();
      this.sentinelObserver = null;
    }
    if (this.layoutTimer) {
      clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
    if (this.bridgeThrottleTimer) {
      clearTimeout(this.bridgeThrottleTimer);
      this.bridgeThrottleTimer = null;
    }
  },
  methods: {
    async initPage() {
      const state = store.getState();
      if (!state.activeMenuId) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      if (!hasRole(state, state.activeMenuId, 'customer')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      this.pageScrollTop = 0;
      this.skipNextRefresh = true;
      this.hasLoaded = false;
      this.systemInfo = this.getSystemInfo();
      this.isSentinelVisible = true;
      this.pinTriggerScrollTop = 0;
      this.suspendPinLock = false;
      this.bridgeActive = false;
      this.bridgePane = '';
      this.bridgeStartTouchY = 0;
      this.bridgeStartPageTop = 0;
      this.pendingBridgeTarget = null;
      this.bridgeThrottleTimer = null;
      this.activeTouch = null;
      this.tabbarHeightPx = 0;
      this.updateStickyPaddingValues();
      await this.loadMenuData();
      this.setupSentinelObserver();
      this.hasLoaded = true;
    },
    async loadMenuData() {
      const state = store.getState();
      const [menu, categories, dishes, options, cart] = await Promise.all([
        getMenuDetail(state.activeMenuId),
        getCategoriesByMenu(state.activeMenuId),
        getDishesByMenu(state.activeMenuId),
        getOptionsByMenu(state.activeMenuId),
        getCart(state.activeMenuId, state.user.id),
      ]);
      const sortedCategories = [...categories].sort(
        (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
      );
      const optionsMap = options.reduce((acc, item) => {
        acc[item.id] = {
          ...item,
          choices: [...(item.choices || [])].sort(
            (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
          ),
        };
        return acc;
      }, {});
      const normalizedDishes = dishes.map((dish) => ({
        ...dish,
        cover: dish.image || dish.coverImage || '',
      }));
      const dishGroups = sortedCategories.map((category) => {
        const categoryDishes = normalizedDishes
          .filter((dish) => dish.categoryId === category.id)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .map((dish) => ({
            ...dish,
            priceText: formatCurrency(dish.price),
            hasOptions: Array.isArray(dish.optionIds) && dish.optionIds.length > 0,
          }));
        return {
          categoryId: category.id,
          categoryName: category.name,
          dishes: categoryDishes,
        };
      });
      const heroImage = menu.coverImage || '';
      const heroTitle = menu.name || '';
      const heroDescription = menu.description || '';
      const nextActiveCategory =
        this.data.activeCategoryId || (sortedCategories[0] && sortedCategories[0].id) || '';
      this.dishMap = normalizedDishes.reduce((acc, dish) => {
        acc[dish.id] = dish;
        return acc;
      }, {});
      this.setData(
        {
          loading: false,
          menu,
          categories: sortedCategories,
          dishGroups,
          activeCategoryId: nextActiveCategory,
          optionsMap,
          cart,
          heroImage,
          heroTitle,
          heroDescription,
        },
        () => {
          this.measureDishGroups();
          this.updateCartSummary();
        }
      );
    },
    updateCartSummary() {
      const { cart } = this.data;
      if (!cart || !Array.isArray(cart.items)) {
        this.setData({
          cartSummary: {
            itemCount: 0,
            totalPrice: 0,
            totalText: '0.00',
          },
        });
        return;
      }
      let itemCount = 0;
      let totalPrice = 0;
      (cart.items || []).forEach((item) => {
        const quantity = Number(item.quantity || 0);
        const unitPrice = normalizePrice(item.priceSnapshot);
        itemCount += quantity;
        totalPrice += unitPrice * quantity;
      });
      this.setData({
        cartSummary: {
          itemCount,
          totalPrice,
          totalText: formatCurrency(totalPrice),
        },
      });
    },
    measureDishGroups() {
      wx.nextTick(() => {
        const query = wx.createSelectorQuery().in(this);
        query
          .selectAll('.dish-group')
          .boundingClientRect((rects) => {
            if (!rects || !rects.length) {
              this.groupOffsets = [];
              return;
            }
            let offset = 0;
            this.groupOffsets = rects.map((rect, index) => {
              const group = this.data.dishGroups[index];
              const start = offset;
              offset += rect.height;
              return {
                id: group?.categoryId || '',
                start,
                end: offset,
              };
            });
          })
          .exec();
      });
    },
    getSystemInfo() {
      if (this.systemInfoCache) return this.systemInfoCache;
      const info = wx.getSystemInfoSync();
      const safeBottom =
        info.safeArea && typeof info.safeArea.bottom === 'number'
          ? Math.max(info.windowHeight - info.safeArea.bottom, 0)
          : 0;
      this.systemInfoCache = {
        windowHeight: info.windowHeight,
        windowWidth: info.windowWidth,
        safeBottom,
        rpxRatio: info.windowWidth ? info.windowWidth / 750 : 1,
      };
      return this.systemInfoCache;
    },
    rpxToPx(value) {
      const info = this.systemInfo || this.getSystemInfo();
      return value * (info.rpxRatio || 1);
    },
    getBottomPaddingPx() {
      const info = this.systemInfo || this.getSystemInfo();
      const buttonHeight = this.rpxToPx(FLOATING_BUTTON_HEIGHT_RPX);
      return info.safeBottom + buttonHeight;
    },
    updateStickyPaddingValues() {
      const safeArea = this.systemInfo && typeof this.systemInfo.safeBottom === 'number' ? this.systemInfo.safeBottom : 0;
      const baseTabHeight =
        typeof this.tabbarHeightPx === 'number' && this.tabbarHeightPx > 0
          ? this.tabbarHeightPx
          : this.rpxToPx(ADMIN_TABBAR_HEIGHT_RPX);
      const extraPadding = this.rpxToPx(LOCK_CONTAINER_VERTICAL_PADDING_RPX);
      const stickyPaddingBottom = Math.max(baseTabHeight + safeArea + extraPadding, 0);
      const stickyPinnedPaddingBottom = Math.max(safeArea, 0);
      if (
        stickyPaddingBottom !== this.data.stickyPaddingBottom ||
        stickyPinnedPaddingBottom !== this.data.stickyPinnedPaddingBottom
      ) {
        this.setData({
          stickyPaddingBottom,
          stickyPinnedPaddingBottom,
        });
      }
    },
    setupSentinelObserver() {
      if (this.sentinelObserver) {
        return;
      }
      try {
        const observer = wx.createIntersectionObserver(this, {
          thresholds: [0, 0.01, 0.2, 0.5],
        });
        observer.relativeToViewport({ top: 0 }).observe('#customerMenuSentinel', (res) => {
          this.handleSentinelIntersection(res);
        });
        this.sentinelObserver = observer;
      } catch (error) {
        console.warn('顾客端 IntersectionObserver 创建失败', error);
      }
    },
    handleSentinelIntersection(res) {
      if (!res) {
        return;
      }
      const isVisible = res.intersectionRatio > 0 && res.boundingClientRect.top >= 0;
      this.isSentinelVisible = isVisible;
      if (isVisible) {
        // 只有在非锁定状态下才允许解锁
        if (!this.data.isPinned) {
          this.suspendPinLock = false;
          if (this.data.pageStyle) {
            this.exitPinned();
          } else if (this.data.innerScrollEnabled) {
            this.setData({ innerScrollEnabled: false });
          }
        }
      } else {
        if (!this.suspendPinLock) {
          this.evaluatePinnedState();
        }
      }
    },
    handlePageScroll({ scrollTop = 0 }) {
      this.pageScrollTop = scrollTop;
      this.evaluatePinnedState();
    },
    evaluatePinnedState() {
      if (this.bridgeActive || this.suspendPinLock) {
        return;
      }
      if (typeof this.pinTriggerScrollTop !== 'number') {
        return;
      }
      const threshold = Math.max((this.pinTriggerScrollTop || 0) - 2, 0);
      const shouldPin = (this.pageScrollTop || 0) >= threshold;
      if (shouldPin) {
        if (!this.data.isPinned) {
          this.enterPinned();
        }
      } else if (this.data.isPinned) {
        this.exitPinned();
      }
    },
    enterPinned() {
      if (this.data.isPinned) {
        return;
      }
      this.setData(
        {
          isPinned: true,
          pageStyle: 'overflow:hidden;height:100vh;',
          innerScrollEnabled: true,
          leftScrollTop: null,
          rightScrollTop: null,
        },
        () => {
          this.scheduleLayoutMeasurement();
        }
      );
    },
    exitPinned(options = {}) {
      const { fromBridge = false } = options || {};
      if (!this.data.isPinned && !this.data.pageStyle && !this.data.innerScrollEnabled) {
        return;
      }
      const patch = {
        isPinned: false,
        pageStyle: '',
        innerScrollEnabled: fromBridge ? true : false,
      };
      this.setData(patch);
    },
    scheduleLayoutMeasurement() {
      if (this.layoutTimer) {
        clearTimeout(this.layoutTimer);
      }
      this.layoutTimer = setTimeout(() => {
        this.layoutTimer = null;
        const query = wx.createSelectorQuery().in(this);
        query.select('#customerMenuSentinel').boundingClientRect();
        query.select('.catalog-section').boundingClientRect();
        query.exec((res) => {
          this.applyLayoutMetrics(res);
        });
      }, 60);
    },
    applyLayoutMetrics(res) {
      if (!Array.isArray(res) || !this.systemInfo) {
        return;
      }
      const sentinelRect = res[0];
      const catalogRect = res[1];
      
      if (sentinelRect && typeof sentinelRect.top === 'number') {
        const offsetPx = this.rpxToPx(PIN_TRIGGER_OFFSET_RPX) || 0;
        const rawTop = (this.pageScrollTop || 0) + sentinelRect.top - offsetPx;
        this.pinTriggerScrollTop = rawTop > 0 ? rawTop : 0;
      }
      
      if (catalogRect && typeof catalogRect.top === 'number') {
        const { windowHeight, safeBottom } = this.systemInfo;
        const tabHeight = this.rpxToPx(ADMIN_TABBAR_HEIGHT_RPX);
        const padding = this.rpxToPx(LOCK_CONTAINER_VERTICAL_PADDING_RPX);
        const minHeight = this.rpxToPx(MENU_COLUMN_MIN_HEIGHT_RPX);
        const height = Math.max(
          windowHeight - tabHeight - safeBottom - padding,
          minHeight
        );
        
        if (this.data.catalogViewportHeight !== height) {
          this.setData({ 
            catalogViewportHeight: height
          });
        }
      }
    },
    onCategoryTap(event) {
      const { id } = event.currentTarget.dataset;
      if (!id || id === this.data.activeCategoryId) return;
      this.setData({
        activeCategoryId: id,
        rightIntoView: `category-${id}`,
      });
    },
    onRightScroll(event) {
      const scrollTop = event.detail.scrollTop || 0;
      if (!this.groupOffsets || !this.groupOffsets.length) return;
      let active = this.groupOffsets[0];
      for (let i = 0; i < this.groupOffsets.length; i += 1) {
        const group = this.groupOffsets[i];
        if (scrollTop + SCROLL_UNLOCK_THRESHOLD >= group.start) {
          active = group;
        } else {
          break;
        }
      }
      if (active && active.id && active.id !== this.data.activeCategoryId) {
        this.setData({ activeCategoryId: active.id });
      }
    },
    onColumnScrollUpper(event) {
      if (!this.data.isPinned) return;
      
      // 检查滚动视图是否真的在顶部
      const scrollTop = event?.detail?.scrollTop || 0;
      if (scrollTop > 5) return; // 还没到顶部
      
      // 只有菜品列表（右侧）滚动到顶部才能触发解锁
      const scrollViewId = event?.currentTarget?.id;
      if (scrollViewId === 'leftScroll') {
        return; // 分类列表（左侧）滚动到顶部不触发解锁
      }
      
      // 只有右侧菜品列表滚动到顶部才触发解锁
      if (scrollViewId !== 'rightScroll') {
        return; // 其他情况也不触发解锁
      }
      
      // 解锁并恢复页面滚动
      const targetScroll = Math.max((this.pinTriggerScrollTop || 0) - SCROLL_UNLOCK_THRESHOLD, 0);
      this.suspendPinLock = true;
      this.exitPinned();
      
      // 使用 nextTick 确保状态更新后再滚动
      wx.nextTick(() => {
        wx.pageScrollTo({ scrollTop: targetScroll, duration: 100 });
        // 延迟恢复锁定检测
        setTimeout(() => {
          this.suspendPinLock = false;
        }, 200);
      });
    },
    onShowRoleSwitcher() {
      const { otherRoles } = this.computeRoleSwitchOptions();
      if (!otherRoles.length) {
        wx.showToast({ title: '暂无其他角色', icon: 'none' });
        return;
      }
      wx.showActionSheet({
        itemList: otherRoles.map((role) => ROLE_LABELS[role] || role),
        success: ({ tapIndex }) => {
          const nextRole = otherRoles[tapIndex];
          if (nextRole) {
            this.switchRole(nextRole);
          }
        },
      });
    },
    computeRoleSwitchOptions() {
      const state = store.getState();
      const menuId = state.activeMenuId;
      const roleList =
        (state.rolesByMenu && menuId && Array.isArray(state.rolesByMenu[menuId])
          ? state.rolesByMenu[menuId]
          : []) || [];
      const activeRole = state.activeRole || 'customer';
      return {
        roles: roleList,
        otherRoles: roleList.filter((role) => role !== activeRole),
        activeRole,
      };
    },
    switchRole(role) {
      const state = store.getState();
      if (!role || role === state.activeRole) {
        return;
      }
      const menuRoles =
        (state.rolesByMenu && state.activeMenuId && state.rolesByMenu[state.activeMenuId]) || [];
      if (!menuRoles.includes(role)) {
        wx.showToast({ title: '暂无该身份', icon: 'none' });
        return;
      }
      store.setState({ activeRole: role });
      this.setData({ activeRole: role });
      if (role === 'customer') {
        wx.redirectTo({ url: '/pages/customer/menu/index' });
      } else if (role === 'admin') {
        wx.redirectTo({ url: '/pages/admin/menu-designer/index' });
      } else if (role === 'chef') {
        wx.redirectTo({ url: '/pages/chef/order-list/index' });
      } else {
        wx.showToast({ title: '暂不支持该身份', icon: 'none' });
      }
    },
    onSwitchRole(event) {
      const { role } = event.detail || {};
      if (!role) return;
      this.switchRole(role);
    },
    onViewDish(event) {
      const { dishId } = event.currentTarget.dataset || {};
      if (!dishId) return;
      wx.navigateTo({ url: `/pages/customer/dish-detail/index?id=${dishId}` });
    },
    onTapAddDish(event) {
      const { dishId } = event.currentTarget.dataset;
      if (this.data.activeRole !== 'customer') {
        wx.showToast({ title: '请切换到顾客身份后点菜', icon: 'none' });
        return;
      }
      const dish = this.dishMap?.[dishId];
      if (!dish) return;
      if (!dish.optionIds || !dish.optionIds.length) {
        this.addDishToCart(dish, {});
        return;
      }
      const selections = {};
      const labels = {};
      const optionList = [];
      (dish.optionIds || []).forEach((optionId) => {
        const option = this.data.optionsMap[optionId];
        if (!option) return;
        const defaultChoice = option.defaultChoice || option.choices[0]?.value;
        selections[optionId] = defaultChoice;
        const choice = option.choices.find((item) => item.value === defaultChoice);
        labels[optionId] = choice ? choice.label : '';
        optionList.push(option);
      });
      this.setData({
        selectedDish: dish,
        selectedOptionList: optionList,
        selectedOptions: selections,
        selectedOptionLabels: labels,
        quantity: 1,
        showOptionModal: true,
        selectedDishPriceText: formatCurrency(dish.price),
      });
    },
    onOptionChange(event) {
      const { selection } = event.detail || {};
      if (!selection) return;
      const labels = { ...this.data.selectedOptionLabels };
      Object.keys(selection).forEach((optionId) => {
        const option = this.data.optionsMap[optionId];
        if (!option) return;
        const choice = option.choices.find((item) => item.value === selection[optionId]);
        labels[optionId] = choice ? choice.label : '';
      });
      this.setData({
        selectedOptions: selection,
        selectedOptionLabels: labels,
      });
    },
    onQuantityInput(event) {
      const value = Number(event.detail.value) || 1;
      const quantity = value < 1 ? 1 : Math.floor(value);
      this.setData({ quantity });
    },
    onCloseModal() {
      this.setData({
        showOptionModal: false,
        selectedOptionList: [],
        selectedDish: null,
        selectedOptions: {},
        selectedOptionLabels: {},
        quantity: 1,
        selectedDishPriceText: '',
      });
    },
    async onConfirmAdd() {
      const { selectedDish, selectedOptionLabels, quantity } = this.data;
      if (!selectedDish) return;
      await this.addDishToCart(selectedDish, selectedOptionLabels, quantity);
      this.onCloseModal();
    },
    async addDishToCart(dish, optionsSnapshot = {}, quantity = 1) {
      const state = store.getState();
      const cart = this.data.cart
        ? { ...this.data.cart, items: [...this.data.cart.items] }
        : { items: [] };
      const snapshot =
        optionsSnapshot && Object.keys(optionsSnapshot).length ? optionsSnapshot : {};
      const existingIndex = cart.items.findIndex(
        (item) =>
          item.dishId === dish.id &&
          JSON.stringify(item.optionsSnapshot || {}) === JSON.stringify(snapshot || {})
      );
      if (existingIndex > -1) {
        cart.items[existingIndex].quantity += quantity;
      } else {
        cart.items.push({
          dishId: dish.id,
          name: dish.name,
          quantity,
          priceSnapshot: dish.price,
          optionsSnapshot: snapshot,
        });
      }
      const updated = await updateCart(state.activeMenuId, state.user.id, cart.items);
      this.setData({ cart: updated }, () => this.updateCartSummary());
      wx.showToast({ title: '已加入购物车', icon: 'success' });
    },
    onGoToCheckout() {
      if (!this.data.cartSummary.itemCount) {
        wx.showToast({ title: '购物车为空', icon: 'none' });
        return;
      }
      wx.navigateTo({ url: '/pages/customer/order-confirm/index' });
    },
    onTabChange(event) {
      const key = event?.detail?.key;
      if (!key || key === 'customerMenu') {
        return;
      }
      const target = CUSTOMER_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
  },
});