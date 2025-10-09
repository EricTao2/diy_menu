import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getMenuDetail,
  getCategoriesByMenu,
  getDishesByMenu,
  sortCategories,
  upsertDish,
  sortDishes,
} from '../../../services/api';
import { ensureRole } from '../../../utils/auth';
import { formatCurrency } from '../../../utils/format';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';
const DEFAULT_CATEGORY_ITEM_HEIGHT = 88;

const PAGE_TRANSITION_DURATION = 180;

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
    heroImage: '',
    heroTitle: '',
    heroSubtitle: '',
    editIcon: '/style/icons/edit.svg',
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
        const firstDishWithImage = dishesRaw.find((item) => item.image);
        const heroImage = (menu && menu.coverImage) || (firstDishWithImage ? firstDishWithImage.image : '');
        const heroTitle = menu && menu.name ? menu.name : '菜单展示';
        const heroSubtitle = menu && menu.description ? menu.description : '管理分类与菜品，打造属于你的菜单';
        let activeCategoryId = preferredCategoryId;
        if (!activeCategoryId) {
          const previous = keepActive ? this.data.activeCategoryId : '';
          if (previous && categories.some((item) => item.id === previous)) {
            activeCategoryId = previous;
          } else if (menu.defaultCategoryId && categories.some((item) => item.id === menu.defaultCategoryId)) {
            activeCategoryId = menu.defaultCategoryId;
          } else {
            activeCategoryId = categories[0] ? categories[0].id : '';
          }
        }
        const activeStatusFilter = this.data.activeStatusFilter || 'all';
        const activeDishes = activeCategoryId
          ? this.filterDishesByStatus(dishesByCategory[activeCategoryId] || [], activeStatusFilter)
          : [];
        const activeCategory = categories.find((item) => item.id === activeCategoryId);
        const currentCategoryName = activeCategory ? activeCategory.name : '';
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
            heroImage,
            heroTitle,
            heroSubtitle,
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
    onCategoryTouchStart(event) {
      const { id, index, dragHandle } = event.currentTarget.dataset;
      const touch = event.touches && event.touches[0];
      if (!dragHandle || !id || touch == null) {
        return;
      }
      this.dragContext = {
        id,
        currentIndex: Number(index),
        lastY: touch.clientY,
        moved: false,
      };
      this.setData({ draggingId: id });
    },
    onCategoryTouchMove(event) {
      if (!this.dragContext) {
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
    async onCategoryTouchEnd() {
      if (!this.dragContext) {
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
    onDishTouchStart(event) {
      if (!event) {
        return;
      }
      const { id, index, dragHandle } = event.currentTarget.dataset;
      if (!dragHandle || (event.mark && event.mark.stopDrag)) {
        return;
      }
      const touch = event.touches && event.touches[0];
      if (!id || touch == null) {
        return;
      }
      this.dishDragContext = {
        id,
        currentIndex: Number(index),
        lastY: touch.clientY,
        moved: false,
        fromHandle: true,
      };
      this.setData({ draggingDishId: id });
    },
    onDishTouchMove(event) {
      if (!this.dishDragContext || !this.dishDragContext.fromHandle) {
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
      if (!this.dishDragContext || !this.dishDragContext.fromHandle) {
        this.dishDragContext = null;
        this.setData({ draggingDishId: '' });
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
    onEditDish(event) {
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      const { id } = event.currentTarget.dataset;
      if (!id) {
        return;
      }
      wx.navigateTo({ url: `/pages/admin/dish-edit/index?id=${id}` });
    },
    onToggleDishStatus(event) {
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      const { id, next } = event.currentTarget.dataset;
      if (!id || !next) {
        return;
      }
      this.changeDishStatus(id, next);
    },
    noop() {},
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
    onBackToMenuSelector() {
      wx.redirectTo({ url: '/pages/menu-selector/index' });
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
