import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getMenuDetail,
  getCategoriesByMenu,
  getDishesByMenu,
  sortCategories,
  sortDishes,
  upsertDish,
} from '../../../services/api';
import { ensureRole } from '../../../utils/auth';
import { formatCurrency } from '../../../utils/format';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';

const app = getApp();
const store = app.getStore();

const ADMIN_TAB_URL_MAP = ADMIN_BOTTOM_TABS.reduce((acc, item) => {
  if (item && item.key) {
    acc[item.key] = item.url;
  }
  return acc;
}, {});

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
  activeRole: state.activeRole,
  rolesByMenu: state.rolesByMenu || {},
});

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'on', label: '已上架' },
  { key: 'off', label: '已下架' },
];

const ROLE_LABELS = {
  admin: '管理员',
  chef: '厨师',
  customer: '顾客',
};

const ROLE_ENTRY_PAGES = {
  admin: '/pages/admin/menu-designer/index',
  chef: '/pages/chef/order-list/index',
  customer: '/pages/customer/menu/index',
};

const DEFAULT_CATEGORY_ITEM_HEIGHT = 88;
const DEFAULT_DISH_ITEM_HEIGHT = 200;
const COLUMN_UNLOCK_THRESHOLD = 4;
const LOCK_CONTAINER_VERTICAL_PADDING_RPX = 100;
const MIN_LAYOUT_HEIGHT_RPX = 520;
const ADMIN_TABBAR_HEIGHT_RPX = 160;
const GESTURE_DEADZONE = 6;
const BRIDGE_SCROLL_INTERVAL = 18;
const RIGHT_GROUP_ANCHOR_OFFSET_RPX = 40;
const PIN_TRIGGER_OFFSET_RPX = 200;

createPage({
  data: {
    loading: true,
    menu: null,
    categories: [],
    dishesByCategory: {},
    displayDishGroups: [],
    activeCategoryId: '',
    statusFilters: STATUS_FILTERS,
    activeStatusFilter: 'all',
    statusCounts: {
      all: 0,
      on: 0,
      off: 0,
    },
    heroImage: '',
    heroTitle: '',
    heroSubtitle: '',
    roleLabels: ROLE_LABELS,
    roleOptions: [],
    showRoleSwitch: false,
    editIcon: '/style/icons/edit.svg',
    draggingCategoryId: '',
    draggingDishId: '',
    scrollIntoCategoryId: '',
    transitionClass: '',
    pageStyle: '',
    isPinned: false,
    innerScrollEnabled: false,
    leftScrollTop: null,
    rightScrollTop: null,
    rightIntoView: '',
    columnsViewportHeight: 0,
    stickyPaddingBottom: 0,
    stickyPinnedPaddingBottom: 0,
  },
  onPageScroll(event) {
    if (typeof this.handlePageScroll === 'function') {
      this.handlePageScroll(event || {});
    }
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
  },
  async onShow() {
    this.updateRoleSwitchState();
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false;
    } else if (this.hasLoaded) {
      await this.loadData({ keepActive: true });
    }
    this.playEnterAnimation();
  },
  onUnload() {
    this.teardown();
  },
  methods: {
    async init() {
      const state = store.getState();
      if (!state.activeMenuId || !ensureRole(state, state.activeMenuId, 'admin')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      this.hasLoaded = false;
      this.skipNextShowRefresh = true;
      this.pageScrollTop = 0;
      this.leftScrollPosition = 0;
      this.rightScrollPosition = 0;
      this.categoryDrag = null;
      this.dishDrag = null;
      this.bridgeActive = false;
      this.bridgePane = '';
      this.bridgeStartTouchY = 0;
      this.bridgeStartPageTop = 0;
      this.pendingBridgeTarget = null;
      this.bridgeThrottleTimer = null;
      this.rightGroupMetrics = [];
      this.isSentinelVisible = true;
      this.pinTriggerScrollTop = 0;
      this.activeTouch = null;
      this.suspendPinLock = false;
      this.systemInfo = this.getSystemInfo();
      this.rightAnchorOffsetPx = this.rpxToPx(RIGHT_GROUP_ANCHOR_OFFSET_RPX);
      this.tabbarHeightPx = 0;
      this.updateStickyPaddingValues();
      this.updateRoleSwitchState();
      await this.loadData();
      this.hasLoaded = true;
      this.playEnterAnimation();
    },
    teardown() {
      if (this.layoutTimer) {
        clearTimeout(this.layoutTimer);
        this.layoutTimer = null;
      }
      if (this.enterTimer) {
        clearTimeout(this.enterTimer);
        this.enterTimer = null;
      }
      if (this.bridgeThrottleTimer) {
        clearTimeout(this.bridgeThrottleTimer);
        this.bridgeThrottleTimer = null;
      }
      if (this.sentinelObserver) {
        this.sentinelObserver.disconnect();
        this.sentinelObserver = null;
      }
    },
    getSystemInfo() {
      const info = wx.getSystemInfoSync();
      const safeAreaBottom =
        info.safeArea && typeof info.safeArea.bottom === 'number'
          ? Math.max(info.windowHeight - info.safeArea.bottom, 0)
          : 0;
      const rpxRatio = info.windowWidth ? info.windowWidth / 750 : 1;
      return {
        windowHeight: info.windowHeight,
        windowWidth: info.windowWidth,
        rpxRatio,
        safeAreaBottom,
      };
    },
    rpxToPx(value) {
      if (!this.systemInfo || typeof value !== 'number') {
        return value;
      }
      return value * this.systemInfo.rpxRatio;
    },
    updateStickyPaddingValues() {
      const safeArea = this.systemInfo && typeof this.systemInfo.safeAreaBottom === 'number' ? this.systemInfo.safeAreaBottom : 0;
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
    measureTabbarHeight() {
      return new Promise((resolve) => {
        wx.createSelectorQuery()
          .in(this)
          .select('#adminTabbar')
          .boundingClientRect((rect) => {
            if (rect && typeof rect.height === 'number' && rect.height > 0) {
              this.tabbarHeightPx = rect.height;
            }
            this.updateStickyPaddingValues();
            resolve();
          })
          .exec();
      });
    },
    async loadData(options = {}) {
      const { keepActive = false } = options;
      const state = store.getState();
      if (!state.activeMenuId) {
        return;
      }
      this.setData({ loading: true });
      try {
        const [menu, categoryList, dishList] = await Promise.all([
          getMenuDetail(state.activeMenuId),
          getCategoriesByMenu(state.activeMenuId),
          getDishesByMenu(state.activeMenuId),
        ]);
        const categories = this.normalizeCategories(categoryList);
        const dishesByCategory = this.normalizeDishes(categories, dishList);
        const activeCategoryId =
          keepActive && this.data.activeCategoryId ? this.data.activeCategoryId : categories[0]?.id || '';
        const statusCounts = this.computeStatusCounts(dishesByCategory);
        const displayDishGroups = this.buildDisplayDishGroups(
          categories,
          dishesByCategory,
          this.data.activeStatusFilter
        );
        this.setData(
          {
            menu,
            loading: false,
            categories,
            dishesByCategory,
            activeCategoryId,
            heroImage: menu?.coverImage || '',
            heroTitle: menu?.name || '菜单名称未设置',
            heroSubtitle: menu?.description || '',
            statusCounts,
            displayDishGroups,
            scrollIntoCategoryId: activeCategoryId ? `category-${activeCategoryId}` : '',
          },
          () => {
            wx.nextTick(() => {
              this.ensureSentinelObserver();
              this.measureTabbarHeight()
                .then(() => {
                  this.scheduleLayoutMeasurement();
                })
                .catch(() => {
                  this.scheduleLayoutMeasurement();
                });
            });
          }
        );
      } catch (error) {
        console.error('加载菜单数据失败', error);
        this.setData({ loading: false });
        wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' });
      }
    },
    normalizeCategories(list = []) {
      return [...list]
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((item) => ({
          ...item,
          name: item.name || '未命名分类',
        }));
    },
    normalizeDishes(categories, dishList = []) {
      const grouped = {};
      categories.forEach((category) => {
        grouped[category.id] = [];
      });
      dishList.forEach((dish) => {
        const key = dish.categoryId;
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push({
          ...dish,
          priceText: formatCurrency(dish.price, '¥'),
        });
      });
      Object.keys(grouped).forEach((key) => {
        grouped[key] = grouped[key].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      });
      return grouped;
    },
    computeStatusCounts(dishesByCategory) {
      const counts = { all: 0, on: 0, off: 0 };
      Object.values(dishesByCategory || {}).forEach((list) => {
        list.forEach((dish) => {
          counts.all += 1;
          if (dish.status === 'on') {
            counts.on += 1;
          } else {
            counts.off += 1;
          }
        });
      });
      return counts;
    },
    buildDisplayDishGroups(categories, dishesByCategory, filterKey) {
      const key = filterKey || 'all';
      return (categories || []).map((category) => {
        const dishList = dishesByCategory[category.id] || [];
        const dishes = dishList
          .map((dish, index) => ({ ...dish, __rawIndex: index }))
          .filter((dish) => key === 'all' || (key === 'on' ? dish.status === 'on' : dish.status !== 'on'));
        return {
          categoryId: category.id,
          categoryName: category.name,
          dishes,
        };
      });
    },
    updateRoleSwitchState() {
      const { roleOptions, showRoleSwitch } = this.computeRoleSwitchState();
      this.setData({ roleOptions, showRoleSwitch });
    },
    computeRoleSwitchState() {
      const state = store.getState();
      const menuId = state.activeMenuId;
      const roleOptionsRaw = (state.rolesByMenu && menuId && state.rolesByMenu[menuId]) || [];
      const roleOptions = Array.isArray(roleOptionsRaw) ? roleOptionsRaw : [];
      const activeRole = state.activeRole || '';
      const otherRoles = roleOptions.filter((role) => role !== activeRole);
      return {
        roleOptions,
        otherRoles,
        activeRole,
        showRoleSwitch: otherRoles.length > 0,
      };
    },
    onShowRoleSwitcher() {
      const { otherRoles } = this.computeRoleSwitchState();
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
    switchRole(role) {
      const state = store.getState();
      if (!role || role === state.activeRole) {
        return;
      }
      store.setState({ activeRole: role });
      const target = ROLE_ENTRY_PAGES[role];
      if (target) {
        wx.redirectTo({ url: target });
      } else {
        wx.showToast({ title: '该角色暂未开放', icon: 'none' });
      }
    },
    ensureSentinelObserver() {
      if (this.sentinelObserver) {
        return;
      }
      try {
        const observer = wx.createIntersectionObserver(this, {
          thresholds: [0, 0.01, 0.2, 0.5],
        });
        observer.relativeToViewport({ top: 0 }).observe('#sentinel', (res) => {
          this.handleSentinelIntersection(res);
        });
        this.sentinelObserver = observer;
      } catch (error) {
        console.warn('创建 IntersectionObserver 失败', error);
      }
    },
    handleSentinelIntersection(res) {
      if (!res) {
        return;
      }
      const isVisible = res.intersectionRatio > 0 && res.boundingClientRect.top >= 0;
      this.isSentinelVisible = isVisible;
      if (isVisible) {
        this.suspendPinLock = false;
        if (!this.bridgeActive) {
          if (this.data.isPinned || this.data.pageStyle) {
            this.exitPinned();
          } else if (this.data.innerScrollEnabled) {
            this.setData({ innerScrollEnabled: false });
          }
        }
      } else {
        if (!this.bridgeActive && !this.suspendPinLock) {
          this.evaluatePinnedState();
        }
      }
    },
    handlePageScroll({ scrollTop = 0 }) {
      this.pageScrollTop = scrollTop;
      this.evaluatePinnedState();
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
    scheduleLayoutMeasurement() {
      if (this.layoutTimer) {
        clearTimeout(this.layoutTimer);
      }
      this.layoutTimer = setTimeout(() => {
        this.layoutTimer = null;
        const query = wx.createSelectorQuery().in(this);
        query.select('#sentinel').boundingClientRect();
        query.select('#menuStickyRoot').boundingClientRect();
        query.exec((res) => {
          this.applyLayoutMetrics(res);
          this.computeRightGroupMetrics();
        });
      }, 60);
    },
    applyLayoutMetrics(res) {
      if (!Array.isArray(res) || !this.systemInfo) {
        return;
      }
      const sentinelRect = res[0];
      const layoutRect = res[1];
      if (sentinelRect && typeof sentinelRect.top === 'number') {
        const offsetPx = this.rpxToPx(PIN_TRIGGER_OFFSET_RPX) || 0;
        const rawTop = (this.pageScrollTop || 0) + sentinelRect.top - offsetPx;
        this.pinTriggerScrollTop = rawTop > 0 ? rawTop : 0;
      }
      if (layoutRect && typeof layoutRect.height === 'number') {
        const { windowHeight, safeAreaBottom } = this.systemInfo;
        const tabHeight =
          typeof this.tabbarHeightPx === 'number' && this.tabbarHeightPx > 0
            ? this.tabbarHeightPx
            : this.rpxToPx(ADMIN_TABBAR_HEIGHT_RPX);
        const padding = this.rpxToPx(LOCK_CONTAINER_VERTICAL_PADDING_RPX);
        const minHeight = this.rpxToPx(MIN_LAYOUT_HEIGHT_RPX);
        const height = Math.max(windowHeight - tabHeight - safeAreaBottom - padding, minHeight);
        if (height !== this.data.columnsViewportHeight) {
          this.setData({ columnsViewportHeight: height });
        }
      }
    },
    computeRightGroupMetrics() {
      wx.createSelectorQuery()
        .in(this)
        .selectAll('.dish-group')
        .boundingClientRect((rects) => {
          if (!Array.isArray(rects) || !rects.length) {
            this.rightGroupMetrics = [];
            return;
          }
          const metrics = [];
          let offset = 0;
          rects.forEach((rect, index) => {
            const group = this.data.displayDishGroups[index];
            if (!group) {
              return;
            }
            const height = rect?.height || 0;
            const top = offset;
            offset += height;
            metrics.push({
              id: group.categoryId,
              top,
              bottom: offset,
            });
          });
          this.rightGroupMetrics = metrics;
        })
        .exec();
    },
    onColumnTouchStart(event) {
      const column = event?.currentTarget?.dataset?.column;
      const touch = (event && event.touches && event.touches[0]) || {};
      if (!column || typeof touch.clientY !== 'number') {
        return;
      }
      this.activeTouch = {
        pane: column,
        startY: touch.clientY,
        lastY: touch.clientY,
      };
    },
    onColumnTouchMove(event) {
      if (!this.activeTouch) {
        return;
      }
      const touch = (event && event.touches && event.touches[0]) || {};
      if (typeof touch.clientY !== 'number') {
        return;
      }
      const delta = touch.clientY - this.activeTouch.lastY;
      this.activeTouch.lastY = touch.clientY;
      if (Math.abs(delta) < GESTURE_DEADZONE) {
        return;
      }
      if (this.bridgeActive) {
        if (delta <= 0) {
          this.stopBridge();
          return;
        }
        this.handleBridgeMove(touch.clientY);
        return;
      }
      if (!this.data.isPinned) {
        return;
      }
      const column = this.activeTouch.pane;
      const scrollTop = column === 'left' ? this.leftScrollPosition : this.rightScrollPosition;
      if (delta > 0 && scrollTop <= COLUMN_UNLOCK_THRESHOLD) {
        this.startBridge(column, touch.clientY);
        this.handleBridgeMove(touch.clientY);
      }
    },
    onColumnTouchEnd() {
      this.stopBridge();
      this.activeTouch = null;
      this.suspendPinLock = false;
      const shouldRePin = !this.data.isPinned && this.isSentinelVisible === false;
      if (shouldRePin) {
        this.enterPinned();
        return;
      }
      if (!this.data.isPinned && this.data.innerScrollEnabled) {
        this.setData({ innerScrollEnabled: false });
      }
    },
    startBridge(pane, touchY) {
      if (this.bridgeActive) {
        return;
      }
      this.suspendPinLock = true;
      this.bridgeActive = true;
      this.bridgePane = pane;
      this.bridgeStartTouchY = touchY;
      this.bridgeStartPageTop = this.pageScrollTop;
      this.pendingBridgeTarget = null;
      if (this.bridgeThrottleTimer) {
        clearTimeout(this.bridgeThrottleTimer);
        this.bridgeThrottleTimer = null;
      }
      this.exitPinned({ fromBridge: true });
      const patch = {};
      if (pane === 'left') {
        patch.leftScrollTop = 0;
      } else if (pane === 'right') {
        patch.rightScrollTop = 0;
      }
      if (Object.keys(patch).length) {
        this.setData(patch);
      }
    },
    handleBridgeMove(currentY) {
      const offset = currentY - this.bridgeStartTouchY;
      const target = this.bridgeStartPageTop - offset;
      const value = target < 0 ? 0 : target;
      this.schedulePageScrollTo(value);
    },
    schedulePageScrollTo(value) {
      if (!this.bridgeThrottleTimer) {
        this.applyPageScroll(value);
        this.bridgeThrottleTimer = setTimeout(() => {
          this.bridgeThrottleTimer = null;
          if (typeof this.pendingBridgeTarget === 'number') {
            this.applyPageScroll(this.pendingBridgeTarget);
            this.pendingBridgeTarget = null;
          }
        }, BRIDGE_SCROLL_INTERVAL);
      } else {
        this.pendingBridgeTarget = value;
      }
    },
    applyPageScroll(scrollTop) {
      wx.pageScrollTo({
        scrollTop: scrollTop < 0 ? 0 : scrollTop,
        duration: 0,
      });
    },
    stopBridge() {
      if (this.bridgeThrottleTimer) {
        clearTimeout(this.bridgeThrottleTimer);
        this.bridgeThrottleTimer = null;
      }
      this.pendingBridgeTarget = null;
      if (this.bridgeActive) {
        this.bridgeActive = false;
        this.bridgePane = '';
        this.bridgeStartTouchY = 0;
        this.bridgeStartPageTop = 0;
        this.setData({
          leftScrollTop: null,
          rightScrollTop: null,
        });
      }
    },
    onLeftScroll(event) {
      this.leftScrollPosition = (event && event.detail && event.detail.scrollTop) || 0;
    },
    onRightScroll(event) {
      const scrollTop = (event && event.detail && event.detail.scrollTop) || 0;
      this.rightScrollPosition = scrollTop;
      if (this.bridgeActive) {
        return;
      }
      const metrics = this.rightGroupMetrics || [];
      if (!metrics.length) {
        return;
      }
      const anchorOffset = typeof this.rightAnchorOffsetPx === 'number' ? this.rightAnchorOffsetPx : 0;
      const current = metrics.find((item) => scrollTop < item.bottom - anchorOffset);
      if (current && current.id && current.id !== this.data.activeCategoryId) {
        this.setData({ activeCategoryId: current.id });
      }
    },
    onSelectCategory(event) {
      const categoryId = event?.currentTarget?.dataset?.id;
      if (!categoryId || categoryId === this.data.activeCategoryId) {
        return;
      }
      this.setData(
        {
          activeCategoryId: categoryId,
          rightIntoView: '',
        },
        () => {
          this.setData({ rightIntoView: `category-${categoryId}` });
        }
      );
    },
    onSelectStatusFilter(event) {
      const key = event?.currentTarget?.dataset?.key;
      if (!key || key === this.data.activeStatusFilter) {
        return;
      }
      const { categories, dishesByCategory } = this.data;
      const displayDishGroups = this.buildDisplayDishGroups(categories, dishesByCategory, key);
      this.setData(
        {
          activeStatusFilter: key,
          displayDishGroups,
        },
        () => {
          this.scheduleLayoutMeasurement();
        }
      );
    },
    onBackToMenuSelector() {
      wx.redirectTo({ url: '/pages/menu-selector/index' });
    },
    onAddDish() {
      const targetCategory = this.data.activeCategoryId;
      const url = targetCategory
        ? `/pages/admin/dish-edit/index?categoryId=${targetCategory}`
        : '/pages/admin/dish-edit/index';
      wx.navigateTo({ url });
    },
    onEditDish(event) {
      const id = event?.currentTarget?.dataset?.id;
      if (!id) {
        return;
      }
      wx.navigateTo({ url: `/pages/admin/dish-edit/index?id=${id}` });
    },
    onTabChange(event) {
      const key = event?.detail?.key;
      if (!key || key === 'menuDesigner') {
        return;
      }
      const target = ADMIN_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
    onCategoryTouchStart(event) {
      const { id, index } = event?.currentTarget?.dataset || {};
      const touch = (event && event.touches && event.touches[0]) || {};
      if (!id || typeof index !== 'number') {
        return;
      }
      this.categoryDrag = {
        id,
        startIndex: index,
        currentIndex: index,
        startY: touch.clientY || 0,
      };
      if (!this.categoryItemHeight) {
        this.categoryItemHeight = DEFAULT_CATEGORY_ITEM_HEIGHT;
        this.measureCategoryItemHeight();
      }
      this.setData({ draggingCategoryId: id });
    },
    onCategoryTouchMove(event) {
      if (!this.categoryDrag) {
        return;
      }
      const touch = (event && event.touches && event.touches[0]) || {};
      if (!touch || typeof touch.clientY !== 'number') {
        return;
      }
      const itemHeight = this.categoryItemHeight || DEFAULT_CATEGORY_ITEM_HEIGHT;
      const delta = touch.clientY - this.categoryDrag.startY;
      const shift = Math.round(delta / itemHeight);
      const categories = [...(this.data.categories || [])];
      if (!categories.length) {
        return;
      }
      let targetIndex = this.categoryDrag.startIndex + shift;
      targetIndex = Math.max(0, Math.min(targetIndex, categories.length - 1));
      if (targetIndex === this.categoryDrag.currentIndex) {
        return;
      }
      const [moved] = categories.splice(this.categoryDrag.currentIndex, 1);
      categories.splice(targetIndex, 0, moved);
      this.categoryDrag.currentIndex = targetIndex;
      this.categoryDrag.moved = true;
      const displayDishGroups = this.buildDisplayDishGroups(
        categories,
        this.data.dishesByCategory,
        this.data.activeStatusFilter
      );
      this.setData({ categories, displayDishGroups }, () => {
        this.scheduleLayoutMeasurement();
      });
    },
    onCategoryTouchEnd() {
      const context = this.categoryDrag;
      this.categoryDrag = null;
      this.setData({ draggingCategoryId: '' });
      if (context && context.moved) {
        this.persistCategoryOrder();
      }
    },
    measureCategoryItemHeight() {
      wx.createSelectorQuery()
        .in(this)
        .select('.category-item')
        .boundingClientRect((rect) => {
          if (rect && rect.height) {
            this.categoryItemHeight = rect.height;
          }
        })
        .exec();
    },
    async persistCategoryOrder() {
      const state = store.getState();
      const menuId = state.activeMenuId;
      if (!menuId) {
        return;
      }
      const categories = this.data.categories || [];
      if (!categories.length) {
        return;
      }
      try {
        await sortCategories(
          menuId,
          categories.map((item) => item.id)
        );
        wx.showToast({ title: '分类已更新', icon: 'success' });
      } catch (error) {
        console.error('分类排序失败', error);
        wx.showToast({ title: '分类排序失败', icon: 'none' });
        await this.loadData({ keepActive: true });
      }
    },
    onDishTouchStart(event) {
      const { id, categoryId, rawIndex } = event?.currentTarget?.dataset || {};
      const touch = (event && event.touches && event.touches[0]) || {};
      if (!id || !categoryId || typeof rawIndex !== 'number') {
        return;
      }
      this.dishDrag = {
        id,
        categoryId,
        startIndex: rawIndex,
        currentIndex: rawIndex,
        startY: touch.clientY || 0,
      };
      if (!this.dishItemHeight) {
        this.dishItemHeight = DEFAULT_DISH_ITEM_HEIGHT;
        this.measureDishItemHeight();
      }
      this.setData({ draggingDishId: id });
    },
    onDishTouchMove(event) {
      if (!this.dishDrag) {
        return;
      }
      const touch = (event && event.touches && event.touches[0]) || {};
      if (!touch || typeof touch.clientY !== 'number') {
        return;
      }
      const itemHeight = this.dishItemHeight || DEFAULT_DISH_ITEM_HEIGHT;
      const delta = touch.clientY - this.dishDrag.startY;
      const shift = Math.round(delta / itemHeight);
      const list = [...(this.data.dishesByCategory[this.dishDrag.categoryId] || [])];
      if (!list.length) {
        return;
      }
      let targetIndex = this.dishDrag.startIndex + shift;
      targetIndex = Math.max(0, Math.min(targetIndex, list.length - 1));
      if (targetIndex === this.dishDrag.currentIndex) {
        return;
      }
      const [moved] = list.splice(this.dishDrag.currentIndex, 1);
      list.splice(targetIndex, 0, moved);
      this.dishDrag.currentIndex = targetIndex;
      this.dishDrag.moved = true;
      const dishesByCategory = {
        ...this.data.dishesByCategory,
        [this.dishDrag.categoryId]: list,
      };
      const displayDishGroups = this.buildDisplayDishGroups(
        this.data.categories,
        dishesByCategory,
        this.data.activeStatusFilter
      );
      this.setData({ dishesByCategory, displayDishGroups }, () => {
        this.scheduleLayoutMeasurement();
      });
    },
    onDishTouchEnd() {
      const context = this.dishDrag;
      this.dishDrag = null;
      this.setData({ draggingDishId: '' });
      if (context && context.moved) {
        this.persistDishOrder(context.categoryId);
      }
    },
    measureDishItemHeight() {
      wx.createSelectorQuery()
        .in(this)
        .select('.dish-card')
        .boundingClientRect((rect) => {
          if (rect && rect.height) {
            this.dishItemHeight = rect.height;
          }
        })
        .exec();
    },
    async persistDishOrder(categoryId) {
      const state = store.getState();
      const menuId = state.activeMenuId;
      if (!menuId || !categoryId) {
        return;
      }
      const list = this.data.dishesByCategory[categoryId] || [];
      if (!list.length) {
        return;
      }
      try {
        await sortDishes(
          menuId,
          categoryId,
          list.map((item) => item.id)
        );
        wx.showToast({ title: '菜品排序已保存', icon: 'success' });
      } catch (error) {
        console.error('菜品排序失败', error);
        wx.showToast({ title: '菜品排序失败', icon: 'none' });
        await this.loadData({ keepActive: true });
      }
    },
    async changeDishStatus(dishId, nextStatus) {
      if (!dishId || !nextStatus) {
        return;
      }
      const dish = this.getDishById(dishId);
      if (!dish) {
        return;
      }
      try {
        const payload = { ...dish, status: nextStatus };
        delete payload.priceText;
        await upsertDish(payload);
        wx.showToast({ title: '状态已更新', icon: 'success' });
        await this.loadData({ keepActive: true });
      } catch (error) {
        console.error('更新菜品状态失败', error);
        wx.showToast({ title: '状态更新失败', icon: 'none' });
      }
    },
    getDishById(id) {
      if (!id) return null;
      const { dishesByCategory } = this.data;
      return (Object.values(dishesByCategory || {}) || []).reduce((result, list) => {
        if (result) return result;
        return (list || []).find((dish) => dish.id === id) || null;
      }, null);
    },
    playEnterAnimation() {
      this.setData({ transitionClass: 'page-enter' });
      if (this.enterTimer) {
        clearTimeout(this.enterTimer);
      }
      this.enterTimer = setTimeout(() => {
        if (this.data.transitionClass === 'page-enter') {
          this.setData({ transitionClass: '' });
        }
      }, 220);
    },
    noop() {}
  }
});
