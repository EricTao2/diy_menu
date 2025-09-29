import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getMenuDetail,
  getCategoriesByMenu,
  getDishesByMenu,
  createCategory,
  sortCategories,
  upsertDish,
  sortDishes,
} from '../../../services/api';
import { ensureRole } from '../../../utils/auth';
import { formatCurrency } from '../../../utils/format';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';
const DEFAULT_CATEGORY_ITEM_HEIGHT = 88;

const PAGE_TRANSITION_DURATION = 180;
const DRAG_LONG_PRESS_THRESHOLD = 500;
const DRAG_CANCEL_DISTANCE = 10;

const ADMIN_TAB_URL_MAP = ADMIN_BOTTOM_TABS.reduce((acc, tab) => {
  acc[tab.key] = tab.url;
  return acc;
}, {});

const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'on', label: '已上架' },
  { key: 'off', label: '已下架' },
];

createPage({
  data: {
    loading: false,
    menu: null,
    categories: [],
    dishesByCategory: {},
    activeCategoryId: '',
    currentCategoryName: '',
    activeDishes: [],
    draggingId: '',
    draggingDishId: '',
    statusFilters: STATUS_FILTERS,
    activeStatusFilter: 'all',
    statusCounts: {
      all: 0,
      on: 0,
      off: 0,
    },
    transitionClass: '',
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
  },
  async onShow() {
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false;
    } else if (this.hasLoaded) {
      await this.loadData({ keepActive: true });
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
      this.dragContext = null;
      this.dishDragContext = null;
      await this.loadData();
      this.hasLoaded = true;
      this.skipNextShowRefresh = true;
    },
    async loadData(options = {}) {
      const { keepActive = false, preferredCategoryId = '' } = options;
      const state = store.getState();
      if (!state.activeMenuId) return;
      this.setData({ loading: true });
      try {
        const [menu, categoriesRaw, dishesRaw] = await Promise.all([
          getMenuDetail(state.activeMenuId),
          getCategoriesByMenu(state.activeMenuId),
          getDishesByMenu(state.activeMenuId),
        ]);
        const categories = [...categoriesRaw].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const dishesByCategory = categories.reduce((acc, category) => {
          const list = dishesRaw
            .filter((dish) => dish.categoryId === category.id)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .map((dish) => ({
              ...dish,
              priceText: formatCurrency(dish.price, '¥'),
            }));
          acc[category.id] = list;
          return acc;
        }, {});
        const statusCounts = {
          all: dishesRaw.length,
          on: dishesRaw.filter((item) => item.status === 'on').length,
          off: dishesRaw.filter((item) => item.status !== 'on').length,
        };
        let activeCategoryId = preferredCategoryId;
        if (!activeCategoryId) {
          const previous = keepActive ? this.data.activeCategoryId : '';
          if (previous && categories.some((item) => item.id === previous)) {
            activeCategoryId = previous;
          } else if (menu.defaultCategoryId && categories.some((item) => item.id === menu.defaultCategoryId)) {
            activeCategoryId = menu.defaultCategoryId;
          } else {
            activeCategoryId = categories[0]?.id || '';
          }
        }
        const activeStatusFilter = this.data.activeStatusFilter || 'all';
        const activeDishes = activeCategoryId
          ? this.filterDishesByStatus(dishesByCategory[activeCategoryId] || [], activeStatusFilter)
          : [];
        const currentCategoryName = categories.find((item) => item.id === activeCategoryId)?.name || '';
        this.setData(
          {
            loading: false,
            menu,
            categories,
            dishesByCategory,
            activeCategoryId,
            activeDishes,
            currentCategoryName,
            draggingId: '',
            draggingDishId: '',
            statusCounts,
          },
          () => {
            this.measureCategoryItemHeight();
            this.measureDishItemHeight();
          }
        );
      } catch (error) {
        console.error('加载菜单数据失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
        this.setData({ loading: false });
      }
    },
    setActiveCategory(categoryId) {
      const { categories, dishesByCategory, activeStatusFilter } = this.data;
      const category = categories.find((item) => item.id === categoryId);
      this.setData({
        activeCategoryId: categoryId,
        currentCategoryName: category ? category.name : '',
        activeDishes: this.filterDishesByStatus(dishesByCategory[categoryId] || [], activeStatusFilter),
      });
    },
    filterDishesByStatus(list, statusKey) {
      if (!statusKey || statusKey === 'all') {
        return list;
      }
      if (statusKey === 'on') {
        return list.filter((item) => item.status === 'on');
      }
      if (statusKey === 'off') {
        return list.filter((item) => item.status !== 'on');
      }
      return list;
    },
    measureCategoryItemHeight() {
      if (this.categoryItemHeight) {
        return;
      }
      wx.createSelectorQuery()
        .in(this)
        .select('.category-item')
        .boundingClientRect((rect) => {
          if (rect && rect.height) {
            this.categoryItemHeight = rect.height;
          } else if (!this.categoryItemHeight) {
            this.categoryItemHeight = DEFAULT_CATEGORY_ITEM_HEIGHT;
          }
        })
        .exec();
    },
    measureDishItemHeight() {
      if (this.dishItemHeight) {
        return;
      }
      wx.createSelectorQuery()
        .in(this)
        .select('.dish-card')
        .boundingClientRect((rect) => {
          if (rect && rect.height) {
            this.dishItemHeight = rect.height;
          } else if (!this.dishItemHeight) {
            this.dishItemHeight = 120;
          }
        })
        .exec();
    },
    onSelectStatusFilter(event) {
      const { key } = event.currentTarget.dataset;
      if (!key || key === this.data.activeStatusFilter) {
        return;
      }
      const { activeCategoryId, dishesByCategory } = this.data;
      const list = this.filterDishesByStatus(dishesByCategory[activeCategoryId] || [], key);
      this.setData({
        activeStatusFilter: key,
        activeDishes: list,
      });
    },
    clearCategoryPressTimer() {
      if (this.categoryPressTimer) {
        clearTimeout(this.categoryPressTimer);
        this.categoryPressTimer = null;
      }
    },
    startCategoryDrag() {
      const pending = this.pendingCategoryDrag;
      if (!pending) {
        return;
      }
      this.dragContext = {
        id: pending.id,
        currentIndex: pending.index,
        lastY: pending.lastY,
        moved: false,
      };
      this.pendingCategoryDrag = null;
      this.setData({ draggingId: pending.id });
    },
    onCategoryTouchStart(event) {
      // Skip initiating drag when the touch starts on controls that opt out
      const targetDataset = event?.target?.dataset || {};
      if (targetDataset.stopDrag) {
        return;
      }
      const { id, index } = event.currentTarget.dataset;
      const touch = event.touches && event.touches[0];
      if (!id || touch == null) {
        return;
      }
      this.clearCategoryPressTimer();
      this.pendingCategoryDrag = {
        id,
        index: Number(index),
        startY: touch.clientY,
        lastY: touch.clientY,
      };
      this.categoryPressTimer = setTimeout(() => {
        this.categoryPressTimer = null;
        this.startCategoryDrag();
      }, DRAG_LONG_PRESS_THRESHOLD);
    },
    onCategoryTouchMove(event) {
      if (!this.dragContext) {
        if (this.pendingCategoryDrag) {
          const touch = event.touches && event.touches[0];
          if (!touch) {
            return;
          }
          const pending = this.pendingCategoryDrag;
          pending.lastY = touch.clientY;
          if (Math.abs(touch.clientY - pending.startY) > DRAG_CANCEL_DISTANCE) {
            this.clearCategoryPressTimer();
            this.pendingCategoryDrag = null;
          }
        }
        return;
      }
      const touch = event.touches && event.touches[0];
      if (!touch) {
        return;
      }
      const height = this.categoryItemHeight || DEFAULT_CATEGORY_ITEM_HEIGHT;
      const diff = touch.clientY - this.dragContext.lastY;
      if (Math.abs(diff) < height * 0.4) {
        return;
      }
      const direction = diff > 0 ? 1 : -1;
      const targetIndex = this.dragContext.currentIndex + direction;
      const maxIndex = this.data.categories.length - 1;
      if (targetIndex < 0 || targetIndex > maxIndex) {
        this.dragContext.lastY = touch.clientY;
        return;
      }
      const categories = [...this.data.categories];
      const [item] = categories.splice(this.dragContext.currentIndex, 1);
      categories.splice(targetIndex, 0, item);
      this.dragContext.currentIndex = targetIndex;
      this.dragContext.lastY = touch.clientY;
      this.dragContext.moved = true;
      this.setData({ categories });
    },
    async onCategoryTouchEnd(event) {
      this.clearCategoryPressTimer();
      const pending = this.pendingCategoryDrag;
      this.pendingCategoryDrag = null;
      if (!this.dragContext) {
        const { id } = pending || event.currentTarget.dataset || {};
        if (id && id !== this.data.activeCategoryId) {
          this.setActiveCategory(id);
        }
        return;
      }
      const moved = this.dragContext.moved;
      this.dragContext = null;
      this.setData({ draggingId: '' });
      if (moved) {
        await this.persistCategoryOrder();
      }
    },
    async persistCategoryOrder() {
      const menuId = store.getState().activeMenuId;
      if (!menuId) return;
      try {
        await sortCategories(menuId, this.data.categories.map((item) => item.id));
      } catch (error) {
        console.error('分类排序失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
        await this.loadData({ keepActive: true });
      }
    },
    onSelectCategory(event) {
      const { id } = event.currentTarget.dataset;
      if (!id || id === this.data.activeCategoryId) return;
      this.setActiveCategory(id);
    },
    clearDishPressTimer() {
      if (this.dishPressTimer) {
        clearTimeout(this.dishPressTimer);
        this.dishPressTimer = null;
      }
    },
    startDishDrag() {
      const pending = this.pendingDishDrag;
      if (!pending) {
        return;
      }
      this.dishDragContext = {
        id: pending.id,
        currentIndex: pending.index,
        lastY: pending.lastY,
        moved: false,
      };
      this.pendingDishDrag = null;
      this.setData({ draggingDishId: pending.id });
    },
    onDishTouchStart(event) {
      const targetDataset = event?.target?.dataset || {};
      if (event?.mark?.stopDrag || targetDataset.stopDrag) {
        this.clearDishPressTimer();
        this.pendingDishDrag = null;
        return;
      }
      const { id, index } = event.currentTarget.dataset;
      const touch = event.touches && event.touches[0];
      if (!id || touch == null) {
        return;
      }
      this.clearDishPressTimer();
      this.pendingDishDrag = {
        id,
        index: Number(index),
        startY: touch.clientY,
        lastY: touch.clientY,
      };
      this.dishPressTimer = setTimeout(() => {
        this.dishPressTimer = null;
        this.startDishDrag();
      }, DRAG_LONG_PRESS_THRESHOLD);
    },
    onDishTouchMove(event) {
      if (!this.dishDragContext) {
        if (this.pendingDishDrag) {
          const touch = event.touches && event.touches[0];
          if (!touch) {
            return;
          }
          const pending = this.pendingDishDrag;
          pending.lastY = touch.clientY;
          if (Math.abs(touch.clientY - pending.startY) > DRAG_CANCEL_DISTANCE) {
            this.clearDishPressTimer();
            this.pendingDishDrag = null;
          }
        }
        return;
      }
      const touch = event.touches && event.touches[0];
      if (!touch) {
        return;
      }
      const height = this.dishItemHeight || 120;
      const diff = touch.clientY - this.dishDragContext.lastY;
      if (Math.abs(diff) < height * 0.4) {
        return;
      }
      const direction = diff > 0 ? 1 : -1;
      const targetIndex = this.dishDragContext.currentIndex + direction;
      const list = [...(this.data.activeDishes || [])];
      if (targetIndex < 0 || targetIndex >= list.length) {
        this.dishDragContext.lastY = touch.clientY;
        return;
      }
      const [item] = list.splice(this.dishDragContext.currentIndex, 1);
      list.splice(targetIndex, 0, item);
      const dishesByCategory = {
        ...this.data.dishesByCategory,
        [this.data.activeCategoryId]: list,
      };
      this.dishDragContext.currentIndex = targetIndex;
      this.dishDragContext.lastY = touch.clientY;
      this.dishDragContext.moved = true;
      this.setData({ activeDishes: list, dishesByCategory });
    },
    async onDishTouchEnd() {
      this.clearDishPressTimer();
      this.pendingDishDrag = null;
      if (!this.dishDragContext) {
        return;
      }
      const moved = this.dishDragContext.moved;
      this.dishDragContext = null;
      this.setData({ draggingDishId: '' });
      if (moved) {
        await this.persistDishOrder();
      }
    },
    async persistDishOrder() {
      const { activeCategoryId, activeDishes } = this.data;
      const menuId = store.getState().activeMenuId;
      if (!menuId || !activeCategoryId) {
        return;
      }
      try {
        await sortDishes(menuId, activeCategoryId, activeDishes.map((item) => item.id));
      } catch (error) {
        console.error('菜品排序失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
        await this.loadData({ keepActive: true });
      }
    },
    onTabChange(event) {
      const { key } = event.detail || {};
      if (!key || key === 'menuDesigner') {
        return;
      }
      const target = ADMIN_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
    async onAddCategory() {
      wx.showModal({
        title: '新增分类',
        editable: true,
        placeholderText: '输入分类名称',
        success: async (res) => {
          if (res.confirm) {
            const name = (res.content || '').trim();
            if (!name) return;
            try {
              const category = await createCategory({
                menuId: store.getState().activeMenuId,
                name,
              });
              wx.showToast({ title: '操作成功', icon: 'success' });
              await this.loadData({ preferredCategoryId: category.id });
            } catch (error) {
              console.error('新增分类失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    onEditDish(event) {
      event.stopPropagation?.();
      const { id } = event.currentTarget.dataset;
      if (!id) {
        return;
      }
      wx.navigateTo({ url: `/pages/admin/dish-edit/index?id=${id}` });
    },
    onToggleDishStatus(event) {
      event.stopPropagation?.();
      const { id, next } = event.currentTarget.dataset;
      if (!id || !next) {
        return;
      }
      this.changeDishStatus(id, next);
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
    getDishById(id) {
      if (!id) return null;
      const { activeCategoryId, dishesByCategory, activeDishes } = this.data;
      const fromActive = (activeDishes || []).find((item) => item.id === id);
      if (fromActive) {
        return fromActive;
      }
      const list = dishesByCategory[activeCategoryId] || [];
      return list.find((item) => item.id === id) || null;
    },
    onAddDish() {
      const { activeCategoryId } = this.data;
      if (!activeCategoryId) return;
      wx.navigateTo({ url: `/pages/admin/dish-edit/index?categoryId=${activeCategoryId}` });
    },
    async changeDishStatus(id, nextStatus) {
      const dish = this.getDishById(id);
      if (!dish) return;
      try {
        const { priceText, ...payload } = dish;
        await upsertDish({ ...payload, status: nextStatus });
        wx.showToast({ title: '操作成功', icon: 'success' });
        await this.loadData({ keepActive: true });
      } catch (error) {
        console.error('更新菜品状态失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },
  },
});
