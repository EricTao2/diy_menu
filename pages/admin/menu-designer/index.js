import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getMenuDetail, getCategoriesByMenu, getDishesByMenu, sortDishes } from '../../../services/api';
import { ensureRole } from '../../../utils/auth';
import { formatCurrency } from '../../../utils/format';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';

const app = getApp();
const store = app.getStore();

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

const ADMIN_TAB_URL_MAP = ADMIN_BOTTOM_TABS.reduce((acc, tab) => {
  if (tab?.key) {
    acc[tab.key] = tab.url;
  }
  return acc;
}, {});

const DEFAULT_DISH_CARD_HEIGHT = 200;
const ANCHOR_ACTIVATE_OFFSET = 60;
const ANCHOR_BOTTOM_OFFSET = 80;

createPage({
  data: {
    loading: true,
    menu: null,
    heroImage: '',
    
    // 哨兵调试参数
    sentinelOffset: 0,  // 负值=更早触发，默认-100rpx（提前100rpx）
    debugSentinel: false,    // 显示哨兵位置，调试完成后设为 false
    
    heroTitle: '',
    heroDescription: '',
    statusFilters: STATUS_FILTERS,
    activeStatusFilter: 'all',
    statusCounts: {
      all: 0,
      on: 0,
      off: 0,
    },
    categories: [],
    dishesByCategory: {},
    dishGroups: [],
    activeCategoryId: '',
    roleLabels: ROLE_LABELS,
    roleOptions: [],
    showRoleSwitch: false,
    draggingDishId: '',
    isMenuLocked: false,
  },
  
  mapStoreToData,
  
  async onLoad() {
    await this.initPage();
  },
  
  async onShow() {
    this.updateRoleSwitchState();
    if (this.skipNextRefresh) {
      this.skipNextRefresh = false;
      return;
    }
    if (this.hasLoaded) {
      await this.loadMenuData({ keepActive: true });
    }
  },
  
  onUnload() {
    this.cleanup();
  },
  
  methods: {
    /**
     * 初始化页面
     */
    async initPage() {
      const state = store.getState();
      if (!state.activeMenuId || !ensureRole(state, state.activeMenuId, 'admin')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      
      this.hasLoaded = false;
      this.skipNextRefresh = true;
      this.dishDrag = null;
      this.dishItemHeight = null;
      this.currentDishScrollTop = 0;
      this.currentPageScrollTop = 0;
      this.lockedAnchors = [];
      this.pageAnchors = [];
      this.lockedViewportHeight = 0;
      this.pageViewportHeight = 0;
      this._manualCategoryScroll = null;
      this._pendingCategoryScroll = null;
      
      this.updateRoleSwitchState();
      await this.loadMenuData();
      
      this.hasLoaded = true;
    },
    
    /**
     * 清理资源
     */
    cleanup() {
      if (this._prepareAnchorsTimer) {
        clearTimeout(this._prepareAnchorsTimer);
        this._prepareAnchorsTimer = null;
      }
      this.lockedAnchors = [];
      this.pageAnchors = [];
      this.lockedViewportHeight = 0;
      this.pageViewportHeight = 0;
      this._manualCategoryScroll = null;
      this._pendingCategoryScroll = null;
    },
    
    /**
     * 加载菜单数据
     */
    async loadMenuData(options = {}) {
      const { keepActive = false } = options || {};
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
        const activeCategoryId = this.resolveActiveCategoryId(categories, keepActive);
        const statusCounts = this.computeStatusCounts(dishesByCategory);
        const dishGroups = this.buildDishGroups(categories, dishesByCategory, this.data.activeStatusFilter);
        
      this.setData({
        loading: false,
        menu,
        heroImage: menu?.coverImage || '',
        heroTitle: menu?.name || '菜单名称未设置',
        heroDescription: menu?.description || '',
          categories,
          dishesByCategory,
          dishGroups,
        statusCounts,
        activeCategoryId,
      }, () => {
        this.afterDishGroupsUpdated();
      });
    } catch (error) {
      console.error('[MenuDesigner] 加载菜单数据失败:', error);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' });
    }
    },
    
    /**
     * 规范化分类数据
     */
    normalizeCategories(list = []) {
      return [...list]
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((item) => ({
          ...item,
          id: item && item.id != null ? String(item.id) : '',
          name: item.name || '未命名分类',
        }));
    },
    
    /**
     * 规范化菜品数据
     */
    normalizeDishes(categories = [], dishes = []) {
      const grouped = {};
      categories.forEach((category) => {
        grouped[category.id] = [];
      });
      
      dishes.forEach((dish) => {
        const targetCategory = dish && dish.categoryId != null ? String(dish.categoryId) : '';
        if (!grouped[targetCategory]) {
          grouped[targetCategory] = [];
        }
        grouped[targetCategory].push({
          ...dish,
          categoryId: targetCategory,
          priceText: formatCurrency(dish.price, '¥'),
        });
      });
      
      Object.keys(grouped).forEach((key) => {
        grouped[key] = grouped[key].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      });
      
      return grouped;
    },
    
    /**
     * 解析激活的分类ID
     */
    resolveActiveCategoryId(categories, keepActive) {
      if (keepActive) {
        const current = this.data.activeCategoryId;
        if (current && categories.some((item) => item.id === current)) {
          return current;
        }
      }
      return categories[0]?.id || '';
    },
    
    /**
     * 计算状态统计
     */
    computeStatusCounts(dishesByCategory = {}) {
      const counts = { all: 0, on: 0, off: 0 };
      Object.values(dishesByCategory).forEach((list) => {
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
    
    /**
     * 构建菜品分组
     */
    buildDishGroups(categories = [], dishesByCategory = {}, filterKey = 'all') {
      const mode = filterKey || 'all';
      return categories.map((category) => {
        const list = dishesByCategory[category.id] || [];
        const filtered = list
          .map((dish, index) => ({
            ...dish,
            rawIndex: index,
          }))
          .filter((dish) => {
            if (mode === 'all') return true;
            if (mode === 'on') return dish.status === 'on';
            return dish.status !== 'on';
          });
        return {
          categoryId: category.id,
          categoryName: category.name,
          dishes: filtered,
        };
      });
    },
    
    /**
     * 更新菜品分组
     */
    updateDishGroups(filterKey) {
      const key = filterKey || this.data.activeStatusFilter;
      const { categories, dishesByCategory } = this.data;
      const groups = this.buildDishGroups(categories, dishesByCategory, key);
      const statusCounts = this.computeStatusCounts(dishesByCategory);
      
      this.setData({
        dishGroups: groups,
        statusCounts,
        categories,
      }, () => {
        this.afterDishGroupsUpdated();
      });
    },
    
    /**
     * 更新角色切换状态
     */
    updateRoleSwitchState() {
      const { roleOptions, showRoleSwitch } = this.computeRoleSwitchState();
      this.setData({ roleOptions, showRoleSwitch });
    },
    
    /**
     * 计算角色切换状态
     */
    computeRoleSwitchState() {
      const state = store.getState();
      const menuId = state.activeMenuId;
      const roles = (state.rolesByMenu && state.rolesByMenu[menuId]) || [];
      const roleOptions = Array.isArray(roles) ? roles : [];
      const activeRole = state.activeRole || '';
      const otherRoles = roleOptions.filter((role) => role !== activeRole);
      return {
        roleOptions,
        otherRoles,
        activeRole,
        showRoleSwitch: otherRoles.length > 0,
      };
    },
    
    /**
     * 显示角色切换器
     */
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
    
    /**
     * 切换角色
     */
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
    
    /**
     * Tab 切换
     */
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
    
    /**
     * 返回菜单选择页
     */
    onBackToMenuSelector() {
      wx.redirectTo({ url: '/pages/menu-selector/index' });
    },
    
    /**
     * 新增菜品
     */
    onAddDish() {
      const categoryId = this.data.activeCategoryId;
      const url = categoryId
        ? `/pages/admin/dish-edit/index?categoryId=${categoryId}`
        : '/pages/admin/dish-edit/index';
      wx.navigateTo({ url });
    },
    
    /**
     * 编辑菜品
     */
    onEditDish(event) {
      const { id } = event?.currentTarget?.dataset || {};
      if (!id) {
        return;
      }
      wx.navigateTo({ url: `/pages/admin/dish-edit/index?id=${id}` });
    },
    
    /**
     * 选择状态筛选
     */
    onSelectStatusFilter(event) {
      const { key } = event?.currentTarget?.dataset || {};
      if (!key || key === this.data.activeStatusFilter) {
        return;
      }
      this.setData({ activeStatusFilter: key }, () => {
        this.updateDishGroups(key);
      });
    },
    
    /**
     * 选择分类
     */
    onSelectCategory(event) {
      const { id } = event?.currentTarget?.dataset || {};
      if (!id) {
        return;
      }
      this.scrollToCategory(id);
    },
    
    /**
     * 锁定状态变化（组件回调）
     */
    onLockChange(event) {
      const { isLocked } = event.detail;
      const pending = this._pendingCategoryScroll;
      this.setData({ isMenuLocked: !!isLocked });
      this._manualCategoryScroll = null;
      this.prepareMenuAnchors();
      if (isLocked) {
        if (!pending || !pending.id) {
          this.syncActiveCategoryByScroll(this.currentDishScrollTop || 0, 'locked');
        }
        if (pending && pending.id) {
          this._pendingCategoryScroll = null;
          const { id, options } = pending;
          this.setData({ activeCategoryId: id });
          wx.nextTick(() => {
            setTimeout(() => {
              this.performCategoryScroll(id, options);
            }, 40);
          });
        }
      } else {
        this.syncActiveCategoryByScroll(this.currentPageScrollTop || 0, 'page');
      }
    },

    /**
     * 菜品滚动事件（来自组件）
     */
    onDishPanelScroll(event) {
      const { scrollTop } = event?.detail || {};
      this.currentDishScrollTop = scrollTop || 0;
      if (!this.data.isMenuLocked) {
        return;
      }
      this.syncActiveCategoryByScroll(this.currentDishScrollTop, 'locked');
    },

    /**
     * 页面滚动事件（来自组件）
     */
    onPagePanelScroll(event) {
      const { scrollTop } = event?.detail || {};
      this.currentPageScrollTop = scrollTop || 0;
      if (this.data.isMenuLocked) {
        return;
      }
      this.syncActiveCategoryByScroll(this.currentPageScrollTop, 'page');
    },
    
    /**
     * 菜品拖拽开始
     */
    onDishHandleTouchStart(event) {
      const { id, categoryId, rawIndex } = event?.currentTarget?.dataset || {};
      const touch = event?.touches?.[0];
      if (!id || !categoryId || typeof rawIndex !== 'number' || !touch) {
        return;
      }
      
      this.dishDrag = {
        id,
        categoryId,
        startIndex: rawIndex,
        currentIndex: rawIndex,
        startY: touch.clientY,
        hasMoved: false,
      };
      
      if (!this.dishItemHeight) {
        this.dishItemHeight = DEFAULT_DISH_CARD_HEIGHT;
        this.measureDishItemHeight();
      }
      
      this.setData({ draggingDishId: id });
    },
    
    /**
     * 菜品拖拽移动
     */
    onDishHandleTouchMove(event) {
      if (!this.dishDrag) {
        return;
      }
      
      const touch = event?.touches?.[0];
      if (!touch) {
        return;
      }
      
      const unit = this.dishItemHeight || DEFAULT_DISH_CARD_HEIGHT;
      const delta = touch.clientY - this.dishDrag.startY;
      const shift = Math.round(delta / unit);
      
      const sourceList = [...(this.data.dishesByCategory[this.dishDrag.categoryId] || [])].map((item) => ({
        ...item,
      }));
      
      if (!sourceList.length) {
        return;
      }
      
      let targetIndex = this.dishDrag.startIndex + shift;
      targetIndex = Math.max(0, Math.min(targetIndex, sourceList.length - 1));
      
      if (targetIndex === this.dishDrag.currentIndex) {
        return;
      }
      
      const [moved] = sourceList.splice(this.dishDrag.currentIndex, 1);
      sourceList.splice(targetIndex, 0, moved);
      this.dishDrag.currentIndex = targetIndex;
      this.dishDrag.hasMoved = true;
      
      const dishesByCategory = {
        ...this.data.dishesByCategory,
        [this.dishDrag.categoryId]: sourceList,
      };
      const groups = this.buildDishGroups(this.data.categories, dishesByCategory, this.data.activeStatusFilter);
      
      this.setData({ dishesByCategory, dishGroups: groups });
    },
    
    /**
     * 菜品拖拽结束
     */
    async onDishHandleTouchEnd() {
      const context = this.dishDrag;
      this.dishDrag = null;
      this.setData({ draggingDishId: '' });
      
      if (context?.hasMoved) {
        await this.persistDishOrder(context.categoryId);
      }
    },
    
    /**
     * 测量菜品卡片高度
     */
    measureDishItemHeight() {
      wx.createSelectorQuery()
        .in(this)
        .select('.dish-card')
        .boundingClientRect((rect) => {
          if (rect?.height) {
            this.dishItemHeight = rect.height;
          }
        })
        .exec();
    },
    
    /**
     * 持久化菜品排序
     */
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
        console.error('[MenuDesigner] 菜品排序失败:', error);
        wx.showToast({ title: '菜品排序失败', icon: 'none' });
        await this.loadMenuData({ keepActive: true });
      }
    },
    
    /**
     * 空操作（用于阻止事件冒泡）
     */
    noop() {},

    /**
     * 菜品分组渲染后的处理
     */
    afterDishGroupsUpdated() {
      this.prepareMenuAnchors();
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
          console.warn('[MenuDesigner] capture anchors: missing container rects', { containerRes });
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
        groupQuery
          .selectAll('.dish-group')
          .fields({ id: true, rect: true, dataset: true, size: true });
        groupQuery.exec((groupRes) => {
          if (!Array.isArray(groupRes) || groupRes.length < 1) {
            console.warn('[MenuDesigner] capture anchors: missing group rects', { groupRes });
            return;
          }
          const groupRects = groupRes[0] || [];
          if (!groupRects.length) {
            console.warn('[MenuDesigner] capture anchors: no dish-group nodes');
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
          console.log('[MenuDesigner] anchors captured', {
            lockedCount: locked.length,
            pageCount: pageAnchors.length,
            firstLocked: locked[0],
          });

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
        const fallbackOffset = options.offset ?? ANCHOR_ACTIVATE_OFFSET;
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
      if (!this.data.isMenuLocked && typeof component.scrollPageToAnchor === 'function') {
        this._pendingCategoryScroll = { id, options: scrollOptions };
        component.scrollPageToAnchor('msc-sentinel');
        return;
      }
      this.performCategoryScroll(id, scrollOptions, component);
    },
    performCategoryScroll(categoryId, options = {}, componentInstance) {
      const id = categoryId != null ? String(categoryId) : '';
      if (!id) {
        return;
      }
      const component = componentInstance || this.selectComponent('#menuScroll');
      if (!component) {
        return;
      }
      const scrollOptions = { ...options, force: true };
      if (this.data.activeCategoryId !== id) {
        this.setData({ activeCategoryId: id });
      }
      const anchorId = `dish-group-${id}`;
      if (this.data.isMenuLocked) {
        const applyScrollTop = (scrollTop) => {
          if (typeof component.scrollDishTo !== 'function') {
            return false;
          }
          const target = Math.max(Number(scrollTop) || 0, 0);
          const adjusted = target <= 0 ? 2 : target;
          component.scrollDishTo(adjusted, scrollOptions);
          return true;
        };
        const query = wx.createSelectorQuery();
        query.select('#msc-dishes').boundingClientRect();
        query.select('#msc-dishes').scrollOffset();
        query.select(`#${anchorId}`).boundingClientRect();
        query.exec((res = []) => {
          const [containerRect, containerOffset, targetRect] = res || [];
          if (containerRect && containerOffset && targetRect) {
            const containerTop = containerRect.top || 0;
            const currentScrollTop =
              typeof containerOffset.scrollTop === 'number' ? containerOffset.scrollTop : 0;
            const targetTop = targetRect.top || 0;
            const nextScrollTop = Math.max(
              Math.round(currentScrollTop + (targetTop - containerTop)),
              0
            );
            if (applyScrollTop(nextScrollTop)) {
              return;
            }
          }
          const lockedAnchors = this.lockedAnchors || [];
          const lockedAnchor = lockedAnchors.find((item) => item && String(item.id) === id);
          if (lockedAnchor && applyScrollTop(lockedAnchor.top)) {
            return;
          }
          applyScrollTop(0);
        });
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
      if (!id) {
        return;
      }
      if (!this.data.isMenuLocked) {
        return;
      }
      console.log('[MenuDesigner] ensureActiveCategoryVisible', {
        categoryId: id,
        isMenuLocked: this.data.isMenuLocked,
        options,
      });
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
          console.warn('[MenuDesigner] category item rect missing', { itemSelector, pageRes });
          return;
        }
        const compQuery = component.createSelectorQuery();
        compQuery.select('#msc-categories').boundingClientRect();
        compQuery.select('#msc-categories').scrollOffset();
        compQuery.exec((compRes = []) => {
          const [containerRect, containerOffset] = compRes || [];
          if (!containerRect || !containerOffset) {
            console.warn('[MenuDesigner] category container rect missing', { compRes });
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
          console.log('[MenuDesigner] category auto scroll computed', {
            categoryId: id,
            currentScrollTop,
            nextScrollTop,
            containerTop,
            containerBottom,
            targetTop,
            targetBottom,
          });
          component.scrollCategoryTo(nextScrollTop);
        });
      });
    },
  },
});
