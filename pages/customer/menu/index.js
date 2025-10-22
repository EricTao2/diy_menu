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

const normalizePrice = (value) => Number(value || 0);
const ANCHOR_BOTTOM_OFFSET = 80;

createPage({
  data: {
    loading: true,
    menu: null,
    categories: [],
    dishGroups: [],
    activeCategoryId: '',
    optionsMap: {},
    customerTabs: CUSTOMER_BOTTOM_TABS,
    cart: null,
    flyDots: [],
    cartDishCountMap: {},
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
    sentinelOffset: 0,
    debugSentinel: false,
    categoryListWidth: 180,
    isMenuLocked: false,
  },
  mapStoreToData,
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
    if (this._prepareAnchorsTimer) {
      clearTimeout(this._prepareAnchorsTimer);
      this._prepareAnchorsTimer = null;
    }
    if (this.flyDotTimers) {
      Object.values(this.flyDotTimers).forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
      this.flyDotTimers = null;
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

      this.hasLoaded = false;
      this.skipNextRefresh = true;
      this.currentPageScrollTop = 0;
      this.currentDishScrollTop = 0;
      this.pendingOptionAnimation = null;
      this.flyDotTimers = {};
      this.lockedAnchors = [];
      this.pageAnchors = [];
      this.lockedViewportHeight = 0;
      this.pageViewportHeight = 0;
      this._manualCategoryScroll = null;
      this._prepareAnchorsTimer = null;

      await this.loadMenuData();
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
          this.prepareMenuAnchors();
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
          cartDishCountMap: {},
        });
        return;
      }
      let itemCount = 0;
      let totalPrice = 0;
      const dishCountMap = {};
      (cart.items || []).forEach((item) => {
        const quantity = Number(item.quantity || 0);
        const unitPrice = normalizePrice(item.priceSnapshot);
        itemCount += quantity;
        totalPrice += unitPrice * quantity;
        if (item.dishId && quantity > 0) {
          const key = String(item.dishId);
          dishCountMap[key] = (dishCountMap[key] || 0) + quantity;
        }
      });
      this.setData({
        cartSummary: {
          itemCount,
          totalPrice,
          totalText: formatCurrency(totalPrice),
        },
        cartDishCountMap: dishCountMap,
      });
    },
    onCategoryTap(event) {
      const { id } = event?.currentTarget?.dataset || {};
      if (!id) {
        return;
      }
      this.scrollToCategory(String(id));
    },
    onLockChange(event) {
      const { isLocked } = event?.detail || {};
      this.setData({ isMenuLocked: !!isLocked });
      this._manualCategoryScroll = null;
      this.prepareMenuAnchors();
      if (isLocked) {
        this.syncActiveCategoryByScroll(this.currentDishScrollTop || 0, 'locked', { force: true });
      } else {
        this.syncActiveCategoryByScroll(this.currentPageScrollTop || 0, 'page', { force: true });
      }
    },
    onDishPanelScroll(event) {
      const { scrollTop } = event?.detail || {};
      this.currentDishScrollTop = scrollTop || 0;
      if (!this.data.isMenuLocked) {
        return;
      }
      this.syncActiveCategoryByScroll(this.currentDishScrollTop, 'locked');
    },
    onPagePanelScroll(event) {
      const { scrollTop } = event?.detail || {};
      this.currentPageScrollTop = scrollTop || 0;
      if (this.data.isMenuLocked) {
        return;
      }
      this.syncActiveCategoryByScroll(this.currentPageScrollTop, 'page');
    },
    prepareMenuAnchors() {
      if (this._prepareAnchorsTimer) {
        clearTimeout(this._prepareAnchorsTimer);
      }
      this._prepareAnchorsTimer = setTimeout(() => {
        this.captureMenuAnchors();
      }, 60);
    },
    captureMenuAnchors() {
      const component = this.selectComponent('#menuScroll');
      if (!component || typeof component.createSelectorQuery !== 'function') {
        return;
      }
      const containerQuery = component.createSelectorQuery();
      containerQuery.select('#msc-dishes').boundingClientRect();
      containerQuery.select('#msc-dishes').scrollOffset();
      containerQuery.select('#msc-scroll').boundingClientRect();
      containerQuery.select('#msc-scroll').scrollOffset();
      containerQuery.exec((containerRes) => {
        if (!Array.isArray(containerRes) || containerRes.length < 4) {
          return;
        }
        const dishRect = containerRes[0] || {};
        const dishOffset = containerRes[1] || {};
        const pageRect = containerRes[2] || {};
        const pageOffset = containerRes[3] || {};

        const dishViewportHeight = dishRect?.height || 0;
        const pageViewportHeight = pageRect?.height || 0;
        if (dishViewportHeight) {
          this.lockedViewportHeight = dishViewportHeight;
        }
        if (pageViewportHeight) {
          this.pageViewportHeight = pageViewportHeight;
        }

        const groupQuery = this.createSelectorQuery();
        groupQuery.selectAll('.dish-group').fields({ id: true, rect: true, dataset: true, size: true });
        groupQuery.exec((groupRes) => {
          if (!Array.isArray(groupRes) || groupRes.length < 1) {
            this.lockedAnchors = [];
            this.pageAnchors = [];
            return;
          }
          const groupRects = groupRes[0] || [];
          if (!groupRects.length) {
            this.lockedAnchors = [];
            this.pageAnchors = [];
            return;
          }

          const dishScrollTop = dishOffset?.scrollTop || 0;
          const pageScrollTop = pageOffset?.scrollTop || 0;
          const dishTop = dishRect?.top || 0;
          const pageTop = pageRect?.top || 0;

          const locked = [];
          const pageAnchors = [];

          groupRects.forEach((item) => {
            if (!item) {
              return;
            }
            const datasetId = item.dataset?.id;
            let categoryId = datasetId != null ? String(datasetId) : '';
            if (!categoryId && item.id) {
              categoryId = item.id.replace('dish-group-', '');
            }
            categoryId = categoryId != null ? String(categoryId) : '';
            if (!categoryId) {
              return;
            }
            const topLocked = dishScrollTop + (item.top - dishTop);
            const topPage = pageScrollTop + (item.top - pageTop);
            locked.push({
              id: categoryId,
              top: topLocked,
              bottom: topLocked + (item.height || 0),
            });
            pageAnchors.push({
              id: categoryId,
              top: topPage,
              bottom: topPage + (item.height || 0),
            });
          });

          locked.sort((a, b) => a.top - b.top);
          pageAnchors.sort((a, b) => a.top - b.top);
          this.lockedAnchors = locked;
          this.pageAnchors = pageAnchors;

          if (this.data.isMenuLocked) {
            this.syncActiveCategoryByScroll(this.currentDishScrollTop || 0, 'locked', { force: true });
          } else {
            this.syncActiveCategoryByScroll(this.currentPageScrollTop || 0, 'page', { force: true });
          }
        });
      });
    },
    syncActiveCategoryByScroll(scrollTop = 0, mode = 'locked', options = {}) {
      const anchors = mode === 'locked' ? this.lockedAnchors : this.pageAnchors;
      if (!anchors || !anchors.length) {
        return;
      }
      const currentId = this.data.activeCategoryId != null ? String(this.data.activeCategoryId) : '';
      const viewportHeight =
        mode === 'locked' ? this.lockedViewportHeight : this.pageViewportHeight;
      let reference;
      if (viewportHeight && viewportHeight > 0) {
        const bottomOffsetValue = Math.max(options.bottomOffset ?? ANCHOR_BOTTOM_OFFSET, 0);
        const effectiveOffset =
          viewportHeight > bottomOffsetValue
            ? bottomOffsetValue
            : Math.max(viewportHeight * 0.2, 0);
        reference = (scrollTop || 0) + Math.max(viewportHeight - effectiveOffset, 0);
      } else {
        const fallbackOffset = options.offset ?? 60;
        reference = (scrollTop || 0) + fallbackOffset;
      }
      let target = anchors[anchors.length - 1];
      for (let i = 0; i < anchors.length; i += 1) {
        const anchor = anchors[i];
        if (!anchor || typeof anchor.bottom !== 'number') {
          continue;
        }
        if (reference <= anchor.bottom) {
          target = anchor;
          break;
        }
      }
      if (!target || target.id == null) {
        return;
      }
      const targetId = String(target.id);
      if (!targetId) {
        return;
      }
      const manual = this._manualCategoryScroll;
      if (!options.force && manual && manual.id === targetId) {
        const elapsed = Date.now() - manual.timestamp;
        if (elapsed < 400) {
          return;
        }
        this._manualCategoryScroll = null;
      }
      if (targetId !== currentId) {
        this.setData({ activeCategoryId: targetId }, () => {
          this.ensureActiveCategoryVisible(targetId, options);
        });
      } else {
        this.ensureActiveCategoryVisible(targetId, options);
      }
    },
    scrollToCategory(categoryId, options = {}) {
      const id = categoryId != null ? String(categoryId) : '';
      if (!id) {
        return;
      }
      const current = this.data.activeCategoryId != null ? String(this.data.activeCategoryId) : '';
      if (id !== current) {
        this.setData({ activeCategoryId: id });
      }
      const component = this.selectComponent('#menuScroll');
      if (!component) {
        return;
      }
      const scrollOptions = { ...options, force: true };
      const anchorId = `dish-group-${id}`;
      if (this.data.isMenuLocked && typeof component.scrollDishTo === 'function') {
        const lockedAnchors = this.lockedAnchors || [];
        const lockedAnchor = lockedAnchors.find((item) => item && String(item.id) === id);
        if (lockedAnchor) {
          component.scrollDishTo(lockedAnchor.top, scrollOptions);
        } else if (typeof component.scrollDishIntoView === 'function') {
          component.scrollDishIntoView(anchorId, scrollOptions);
        }
      } else if (typeof component.scrollDishIntoView === 'function') {
        component.scrollDishIntoView(anchorId, scrollOptions);
      }
      this._manualCategoryScroll = {
        id,
        timestamp: Date.now(),
      };
      this.ensureActiveCategoryVisible(id, scrollOptions);
    },
    ensureActiveCategoryVisible(categoryId, options = {}) {
      const id = categoryId != null ? String(categoryId) : '';
      if (!id || !this.data.isMenuLocked) {
        return;
      }
      const component = this.selectComponent('#menuScroll');
      if (!component || typeof component.scrollCategoryTo !== 'function' || typeof component.createSelectorQuery !== 'function') {
        return;
      }
      const itemSelector = `#category-item-${id}`;
      const pageQuery = this.createSelectorQuery();
      pageQuery.select(itemSelector).boundingClientRect();
      pageQuery.exec((pageRes = []) => {
        const [itemRect] = pageRes || [];
        if (!itemRect) {
          return;
        }
        const compQuery = component.createSelectorQuery();
        compQuery.select('#msc-categories').boundingClientRect();
        compQuery.select('#msc-categories').scrollOffset();
        compQuery.exec((compRes = []) => {
          const [containerRect, containerOffset] = compRes || [];
          if (!containerRect || !containerOffset) {
            return;
          }
          const containerTop = containerRect.top || 0;
          const containerBottom = containerTop + (containerRect.height || 0);
          const currentScrollTop = typeof containerOffset.scrollTop === 'number' ? containerOffset.scrollTop : 0;
          const targetTop = itemRect.top || 0;
          const targetBottom = itemRect.bottom || 0;
          let nextScrollTop = currentScrollTop;
          if (targetTop < containerTop) {
            nextScrollTop = Math.max(currentScrollTop - (containerTop - targetTop), 0);
          } else if (targetBottom > containerBottom) {
            nextScrollTop = currentScrollTop + (targetBottom - containerBottom);
          } else {
            return;
          }
          component.scrollCategoryTo(nextScrollTop);
        });
      });
    },
    onGoMenuSelector() {
      wx.redirectTo({ url: '/pages/menu-selector/index' });
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
    async onTapAddDish(event) {
      const { dishId, domId, dotColor } = event?.currentTarget?.dataset || {};
      const animationColor = dotColor || '#2e8df1';
      this.pendingOptionAnimation = null;
      if (this.data.activeRole !== 'customer') {
        wx.showToast({ title: '请切换到顾客身份后点菜', icon: 'none' });
        return;
      }
      const dish = this.dishMap?.[dishId];
      if (!dish) return;
      if (!dish.optionIds || !dish.optionIds.length) {
        await this.addDishToCart(dish, {});
        if (domId) {
          this.startFlyAnimation(domId, animationColor);
        }
        return;
      }
      if (domId) {
        this.pendingOptionAnimation = { domId, color: animationColor };
      } else {
        this.pendingOptionAnimation = null;
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
      this.pendingOptionAnimation = null;
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
      const { selectedDish, selectedOptions, selectedOptionLabels, selectedOptionList, quantity } = this.data;
      if (!selectedDish) return;
      const pendingAnimation = this.pendingOptionAnimation;
      this.pendingOptionAnimation = null;

      // 生成完整的optionsSnapshot
      const optionsSnapshot = {};
      selectedOptionList.forEach((option) => {
        const selectedValue = selectedOptions[option.id];
        const selectedChoice = option.choices.find(choice => choice.value === selectedValue);
        optionsSnapshot[option.id] = {
          name: option.name,
          choices: option.choices,
          selectedValue: selectedValue,
          selectedLabel: selectedChoice ? selectedChoice.label : '',
        };
      });
      
      await this.addDishToCart(selectedDish, optionsSnapshot, quantity);
      if (pendingAnimation && pendingAnimation.domId) {
        this.startFlyAnimation(pendingAnimation.domId, pendingAnimation.color);
      }
      this.onCloseModal();
    },
    async decreaseSimpleDishQuantity(dish) {
      if (!dish) return;
      const state = store.getState();
      const baseItems = Array.isArray(this.data.cart?.items) ? this.data.cart.items : [];
      const cart = this.data.cart
        ? { ...this.data.cart, items: [...baseItems] }
        : { items: [] };
      const targetIndex = cart.items.findIndex((item) => {
        if (item.dishId !== dish.id) {
          return false;
        }
        const snapshot = item.optionsSnapshot || {};
        return !snapshot || !Object.keys(snapshot).length;
      });
      if (targetIndex < 0) {
        return;
      }
      const currentQuantity = Number(cart.items[targetIndex].quantity || 0);
      if (currentQuantity <= 1) {
        cart.items.splice(targetIndex, 1);
      } else {
        cart.items[targetIndex].quantity = currentQuantity - 1;
      }
      const updated = await updateCart(state.activeMenuId, state.user.id, cart.items);
      this.setData({ cart: updated }, () => this.updateCartSummary());
    },
    async addDishToCart(dish, optionsSnapshot = {}, quantity = 1) {
      const state = store.getState();
      const baseItems = Array.isArray(this.data.cart?.items) ? this.data.cart.items : [];
      const cart = this.data.cart
        ? { ...this.data.cart, items: [...baseItems] }
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
    startFlyAnimation(domId, color) {
      if (!domId) {
        return;
      }
      const query = this.createSelectorQuery();
      query.select(`#${domId}`).boundingClientRect();
      query.select('#floating-cart').boundingClientRect();
      query.exec((res = []) => {
        const [sourceRect, targetRect] = res || [];
        if (!sourceRect || !targetRect) {
          return;
        }
        const sourceTop = (sourceRect.top || 0) + (sourceRect.height || 0) / 2;
        const sourceLeft = (sourceRect.left || 0) + (sourceRect.width || 0) / 2;
        const targetTop = (targetRect.top || 0) + (targetRect.height || 0) / 2;
        const targetLeft = (targetRect.left || 0) + (targetRect.width || 0) / 2;
        const translateX = targetLeft - sourceLeft;
        const translateY = targetTop - sourceTop;
        const dotId = `dot-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newDots = [...(this.data.flyDots || [])];
        newDots.push({
          id: dotId,
          top: sourceTop,
          left: sourceLeft,
          translateX: 0,
          translateY: 0,
          opacity: 1,
          color: color || '#2e8df1',
        });
        const dotIndex = newDots.length - 1;
        this.setData({ flyDots: newDots }, () => {
          wx.nextTick(() => {
            this.setData({
              [`flyDots[${dotIndex}].translateX`]: translateX,
              [`flyDots[${dotIndex}].translateY`]: translateY,
              [`flyDots[${dotIndex}].opacity`]: 0,
            });
          });
          if (!this.flyDotTimers) {
            this.flyDotTimers = {};
          }
          this.flyDotTimers[dotId] = setTimeout(() => {
            this.removeFlyDot(dotId);
          }, 650);
        });
      });
    },
    removeFlyDot(dotId) {
      if (!dotId) {
        return;
      }
      if (this.flyDotTimers && this.flyDotTimers[dotId]) {
        clearTimeout(this.flyDotTimers[dotId]);
        delete this.flyDotTimers[dotId];
      }
      const list = this.data.flyDots || [];
      const index = list.findIndex((item) => item && item.id === dotId);
      if (index === -1) {
        return;
      }
      const nextList = [...list];
      nextList.splice(index, 1);
      this.setData({ flyDots: nextList });
    },
    async onTapDecreaseDish(event) {
      const dishId = event?.currentTarget?.dataset?.dishId;
      if (!dishId) {
        return;
      }
      if (this.data.activeRole !== 'customer') {
        wx.showToast({ title: '请切换到顾客身份后点菜', icon: 'none' });
        return;
      }
      const dish = this.dishMap?.[dishId];
      if (!dish || (dish.optionIds && dish.optionIds.length)) {
        return;
      }
      await this.decreaseSimpleDishQuantity(dish);
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
