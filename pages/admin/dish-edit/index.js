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

const DISH_IMAGE_DIR = 'dish_images';
const MAX_DISH_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

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

const parseNumberField = (value, { allowFloat = false, maxDecimals = 0 } = {}) => {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') {
    return { valid: false, value: 0, reason: 'empty' };
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { valid: false, value: 0, reason: 'nan' };
  }
  if (!allowFloat && !Number.isInteger(parsed)) {
    return { valid: false, value: 0, reason: 'integer' };
  }
  if (parsed < 0) {
    return { valid: false, value: 0, reason: 'negative' };
  }
  if (!allowFloat) {
    return { valid: true, value: parsed };
  }
  const decimalPart = trimmed.split('.')[1] || '';
  if (decimalPart.length > maxDecimals) {
    return { valid: false, value: 0, reason: 'decimals' };
  }
  const rounded =
    typeof maxDecimals === 'number' && maxDecimals >= 0
      ? Math.round(parsed * Math.pow(10, maxDecimals)) / Math.pow(10, maxDecimals)
      : parsed;
  return { valid: true, value: rounded };
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
      price: '1',
      status: true,
      categoryId: '',
      image: '',
      description: '',
      tags: '',
      optionIds: [],
      recipeId: '',
    },
    recipe: null,
    recipeMissing: false,
    saving: false,
    deleting: false,
    transitionClass: '',
    imageUploading: false,
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
      const normalizedOptionsData = options.map((option) => ({
        ...option,
        choiceSummary: Array.isArray(option.choices)
          ? option.choices.map((choice) => choice.label).join(' / ')
          : '',
      }));
      const categoryPicker = categories.map((item) => item.name);
      this.setData({ categories, options: normalizedOptionsData, categoryPicker });

      if (query?.id) {
        const dish = await getDishDetail(query.id);
        const normalizedOptionIds = normalizeOptionIds(dish.optionIds);
        this.setData({
          isEdit: true,
          dishId: query.id,
          form: {
            name: dish.name,
            price: (Number(dish.price ?? 0)).toFixed(1),
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
      if (!recipeId) {
        this.setData({ recipe: null, recipeMissing: false });
        return;
      }
      try {
        const recipe = await getRecipeById(recipeId);
        this.setData({ recipe, recipeMissing: false });
      } catch (error) {
        console.error('加载菜谱失败', error);
        this.setData({ recipe: null, recipeMissing: true });
      }
    },
    setDishImage(value) {
      this.setData({
        form: {
          ...this.data.form,
          image: value,
        },
      });
    },
    async onChooseImage() {
      if (this.data.imageUploading) {
        return;
      }
      if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
        wx.showToast({ title: '云能力不可用', icon: 'none' });
        return;
      }
      const chooseImage = wx.chooseMedia
        ? () =>
            wx.chooseMedia({
              count: 1,
              mediaType: ['image'],
              sizeType: ['compressed'],
            })
        : () =>
            wx.chooseImage({
              count: 1,
              sizeType: ['compressed'],
            });
      let tempFilePath = '';
      let fileSize = 0;
      try {
        const res = await chooseImage();
        if (!res) {
          return;
        }
        if (res.tempFiles && res.tempFiles.length) {
          tempFilePath = res.tempFiles[0].tempFilePath;
          fileSize = res.tempFiles[0].size || 0;
        } else if (res.tempFilePaths && res.tempFilePaths.length) {
          tempFilePath = res.tempFilePaths[0];
        }
        if (!tempFilePath) {
          return;
        }
      } catch (error) {
        if (error && error.errMsg && error.errMsg.includes('cancel')) {
          return;
        }
        console.error('选择菜品图片失败', error);
        wx.showToast({ title: '选择失败', icon: 'none' });
        return;
      }
      if (fileSize && fileSize > MAX_DISH_IMAGE_FILE_SIZE) {
        wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
        return;
      }
      await this.uploadDishImage(tempFilePath);
    },
    async uploadDishImage(tempFilePath) {
      if (!tempFilePath) {
        return;
      }
      if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
        wx.showToast({ title: '云能力不可用', icon: 'none' });
        return;
      }
      const { activeMenuId } = store.getState();
      const menuId = activeMenuId || 'menu';
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const extMatch = /\.([a-zA-Z0-9]+)(\?.*)?$/.exec(tempFilePath);
      const ext = extMatch ? extMatch[1] : 'jpg';
      const cloudPath = `${DISH_IMAGE_DIR}/${menuId}-${timestamp}-${random}.${ext}`;
      this.setData({ imageUploading: true });
      wx.showLoading({ title: '上传中', mask: true });
      try {
        const result = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath,
        });
        if (!result || !result.fileID) {
          throw new Error('missing_file_id');
        }
        this.setDishImage(result.fileID);
        wx.showToast({ title: '上传成功', icon: 'success' });
      } catch (error) {
        console.error('上传菜品图片失败', error);
        wx.showToast({ title: '上传失败', icon: 'none' });
      } finally {
        wx.hideLoading();
        this.setData({ imageUploading: false });
      }
    },
    onPreviewImage() {
      const { image } = this.data.form;
      if (!image) {
        return;
      }
      wx.previewImage({
        urls: [image],
        current: image,
      });
    },
    onClearImage() {
      if (!this.data.form.image) {
        return;
      }
      this.setDishImage('');
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
              recipeMissing: false,
            });
            
            wx.showToast({ title: '已关联菜谱', icon: 'success' });
          },
        },
      });
    },
    onViewRecipe() {
      const { form, recipeMissing } = this.data;
      if (!form.recipeId) {
        return;
      }
      if (recipeMissing) {
        wx.showToast({ title: '关联的菜谱已删除', icon: 'none' });
        return;
      }
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
      const priceValidation = parseNumberField(price, { allowFloat: true, maxDecimals: 1 });
      if (!priceValidation.valid) {
        this.showError('价格必须为非负数字，且最多保留1位小数');
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
