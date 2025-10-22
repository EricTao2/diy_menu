import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getCategoriesByMenu,
  getOptionsByMenu,
  upsertDish,
  getDishDetail,
  deleteDish,
  getRecipeById,
} from '../../../services/api';
import { ensureRole } from '../../../utils/auth';
const app = getApp();
const store = app.getStore();

const normalizeOptionIds = (optionIds) => {
  if (!Array.isArray(optionIds)) {
    return [];
  }
  const normalized = optionIds
    .map((id) => String(id).trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
};

const buildOptionSelectionMap = (optionIds) => {
  const map = {};
  normalizeOptionIds(optionIds).forEach((id) => {
    map[id] = true;
  });
  return map;
};

const parseNumberField = (value, { allowFloat = false } = {}) => {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') {
    return { valid: false, value: 0 };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { valid: false, value: 0 };
  }
  if (!allowFloat && !Number.isInteger(parsed)) {
    return { valid: false, value: 0 };
  }
  if (parsed < 0) {
    return { valid: false, value: 0 };
  }
  return { valid: true, value: parsed };
};

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

createPage({
  data: {
    isEdit: false,
    dishId: '',
    categories: [],
    options: [],
    categoryPicker: [],
    selectedCategoryName: '',
    optionSelectionMap: {},
    errorVisible: false,
    errorMessage: '',
    form: {
      name: '',
      price: '',
      stock: '',
      status: true,
      categoryId: '',
      image: '',
      description: '',
      tags: '',
      optionIds: [],
      recipeId: '',
    },
    recipe: null,
    saving: false,
    deleting: false,
    transitionClass: '',
  },
  mapStoreToData,
  async onLoad(query) {
    await this.init(query);
  },
  onUnload() {
    if (typeof this.clearErrorTimer === 'function') {
      this.clearErrorTimer();
    }
  },
  onHide() {
    if (typeof this.clearErrorTimer === 'function') {
      this.clearErrorTimer();
    }
  },
  methods: {
    async init(query = {}) {
      const state = store.getState();
      const { activeMenuId } = state;
      if (!activeMenuId) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      if (!ensureRole(state, activeMenuId, 'admin')) {
        wx.redirectTo({ url: '/pages/menu-selector/index' });
        return;
      }
      const [categories, options] = await Promise.all([
        getCategoriesByMenu(activeMenuId),
        getOptionsByMenu(activeMenuId),
      ]);
      const categoryPicker = categories.map((item) => item.name);
      this.setData({ categories, options, categoryPicker });

      if (query?.id) {
        const dish = await getDishDetail(query.id);
        const normalizedOptionIds = normalizeOptionIds(dish.optionIds);
        this.setData({
          isEdit: true,
          dishId: query.id,
          form: {
            name: dish.name,
            price: String(dish.price),
            stock: String(dish.stock || 0),
            status: dish.status === 'on',
            categoryId: dish.categoryId,
            image: dish.image,
            description: dish.description,
            tags: (dish.tags || []).join(','),
            optionIds: normalizedOptionIds,
            recipeId: dish.recipeId || '',
          },
          optionSelectionMap: buildOptionSelectionMap(normalizedOptionIds),
        }, () => this.updateSelectedCategoryName());
        
        // 加载关联的菜谱
        if (dish.recipeId) {
          await this.loadRecipe(dish.recipeId);
        }
      } else {
        const preferred = query?.categoryId;
        const category = categories.find((item) => item.id === preferred) || categories[0] || null;
        const normalizedOptionIds = normalizeOptionIds([]);
        this.setData({
          form: {
            ...this.data.form,
            categoryId: category ? category.id : '',
            optionIds: normalizedOptionIds,
          },
          optionSelectionMap: buildOptionSelectionMap(normalizedOptionIds),
        }, () => this.updateSelectedCategoryName());
      }
    },
    onInput(event) {
      const { field } = event.currentTarget.dataset;
      this.setData({
        form: {
          ...this.data.form,
          [field]: event.detail.value,
        },
      });
    },
    onSwitchStatus(event) {
      this.setData({
        form: {
          ...this.data.form,
          status: event.detail.value,
        },
      });
    },
    onCategoryChange(event) {
      const index = event.detail.value;
      const category = this.data.categories[index];
      this.setData({
        form: {
          ...this.data.form,
          categoryId: category ? category.id : '',
        },
      });
      this.updateSelectedCategoryName();
    },
    onOptionToggle(event) {
      const optionId = event.currentTarget?.dataset?.optionId || event.target?.dataset?.optionId;
      if (!optionId) {
        return;
      }
      const normalizedId = String(optionId).trim();
      if (!normalizedId) {
        return;
      }
      const current = normalizeOptionIds(this.data.form.optionIds);
      const hasSelected = current.includes(normalizedId);
      const next = hasSelected
        ? current.filter((id) => id !== normalizedId)
        : [...current, normalizedId];
      this.syncOptionSelection(next);
    },
    onDeleteDish() {
      if (!this.data.isEdit || !this.data.dishId) {
        return;
      }
      wx.showModal({
        title: '删除菜品',
        content: '确认删除该菜品？',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          this.setData({ deleting: true });
          try {
            await deleteDish(this.data.dishId);
            wx.showToast({ title: '操作成功', icon: 'success' });
            wx.navigateBack();
          } catch (error) {
            console.error('删除菜品失败', error);
            this.showError('删除菜品失败，请稍后再试');
          } finally {
            this.setData({ deleting: false });
          }
        },
      });
    },
    async loadRecipe(recipeId) {
      try {
        const recipe = await getRecipeById(recipeId);
        this.setData({ recipe });
      } catch (error) {
        console.error('加载菜谱失败', error);
        this.setData({ recipe: null });
      }
    },
    onSelectRecipe() {
      wx.navigateTo({
        url: '/pages/user/recipe-select/index',
        events: {
          selectRecipe: async (recipe) => {
            const { form } = this.data;
            
            // 自动填充菜品信息
            const updates = { recipeId: recipe.id };
            if (!form.name) {
              updates.name = recipe.name;
            }
            if (!form.description) {
              updates.description = recipe.content || '';
            }
            if (!form.image && recipe.coverImage) {
              updates.image = recipe.coverImage;
            }
            
            this.setData({
              form: { ...form, ...updates },
              recipe,
            });
            
            wx.showToast({ title: '已关联菜谱', icon: 'success' });
          },
        },
      });
    },
    onViewRecipe() {
      const { form } = this.data;
      if (form.recipeId) {
        wx.navigateTo({
          url: `/pages/user/recipe-detail/index?recipeId=${form.recipeId}`,
        });
      }
    },
    onChangeRecipe() {
      this.onSelectRecipe();
    },
    async onSubmit() {
      const { activeMenuId } = store.getState();
      const {
        name,
        price,
        stock,
        status,
        categoryId,
        image,
        description,
        tags,
        optionIds,
        recipeId,
      } = this.data.form;
      if (!name) {
        this.showError('请填写菜品名称');
        return;
      }
      if (!categoryId) {
        this.showError('请选择所属分类');
        return;
      }
      const priceValidation = parseNumberField(price, { allowFloat: true });
      if (!priceValidation.valid) {
        this.showError('价格必须设置为数字');
        return;
      }
      const stockValidation = parseNumberField(stock, { allowFloat: false });
      if (!stockValidation.valid) {
        this.showError('库存必须为非负整数');
        return;
      }
      this.setData({ saving: true });
      try {
        const normalizedOptionIds = normalizeOptionIds(optionIds);

        await upsertDish({
          id: this.data.isEdit ? this.data.dishId : undefined,
          menuId: activeMenuId,
          name,
          categoryId,
          price: priceValidation.value,
          stock: stockValidation.value,
          status: status ? 'on' : 'off',
          image,
          description,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          optionIds: normalizedOptionIds,
          recipeId: recipeId || undefined,
        });
        wx.showToast({ title: '操作成功', icon: 'success' });
        wx.navigateBack();
      } catch (error) {
        console.error('保存菜品失败', error);
        this.showError('保存菜品失败，请稍后再试');
      } finally {
        this.setData({ saving: false });
      }
    },
    updateSelectedCategoryName() {
      const category = this.data.categories.find((item) => item.id === this.data.form.categoryId);
      this.setData({ selectedCategoryName: category ? category.name : '' });
    },
    syncOptionSelection(optionIds) {
      const normalized = normalizeOptionIds(optionIds);
      this.setData({
        'form.optionIds': normalized,
        optionSelectionMap: buildOptionSelectionMap(normalized),
      });
    },
    showError(message) {
      if (!message) {
        return;
      }
      this.clearErrorTimer();
      this.setData({ errorVisible: true, errorMessage: message });
      this.errorTimer = setTimeout(() => {
        this.setData({ errorVisible: false, errorMessage: '' });
        this.errorTimer = null;
      }, 2000);
    },
    clearErrorTimer() {
      if (this.errorTimer) {
        clearTimeout(this.errorTimer);
        this.errorTimer = null;
      }
      if (this.data.errorVisible) {
        this.setData({ errorVisible: false, errorMessage: '' });
      }
    },
    hideError() {
      this.clearErrorTimer();
    },
    stopErrorDismiss() {
      // prevent mask tap from closing when interacting with toast
    },
  },
});
