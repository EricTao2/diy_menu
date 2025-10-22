import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import {
  getMenuDetail,
  updateMenuSettings,
  getCategoriesByMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  sortCategories,
  deleteMenu,
  getOptionsByMenu,
  upsertOption,
  deleteOption,
} from '../../../services/api';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';
import { ensureRole } from '../../../utils/auth';
const app = getApp();
const store = app.getStore();
const themeManager = app.getThemeManager();

const PAGE_TRANSITION_DURATION = 180;
const MENU_COVER_DIR = 'menu_covers';
const MAX_COVER_FILE_SIZE = 10 * 1024 * 1024;

const slugify = (text = '') =>
  `${text}`
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const ADMIN_TAB_URL_MAP = ADMIN_BOTTOM_TABS.reduce((acc, tab) => {
  acc[tab.key] = tab.url;
  return acc;
}, {});

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

createPage({
  data: {
    menu: null,
    form: {
      name: '',
      description: '',
      theme: 'light',
      coverImage: '',
    },
    themeOptions: [],
    saving: false,
    categories: [],
    options: [],
    optionForm: {
      id: '',
      name: '',
      defaultChoice: '',
      choices: [],
    },
    optionChoiceInput: '',
    optionEditing: false,
    transitionClass: '',
    coverUploading: false,
  },
  mapStoreToData,
  async onLoad() {
    await this.init();
  },
  async onShow() {
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false;
    } else if (this.initialized) {
      const { activeMenuId } = store.getState();
      if (activeMenuId) {
        await Promise.all([
          this.loadMenu(activeMenuId),
          this.loadCategories(activeMenuId),
          this.loadOptions(activeMenuId),
        ]);
      }
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
      const themes = themeManager.getAvailableThemes();
      this.setData({
        themeOptions: themes,
      });
      await Promise.all([
        this.loadMenu(state.activeMenuId),
        this.loadCategories(state.activeMenuId),
        this.loadOptions(state.activeMenuId),
      ]);
      this.initialized = true;
      this.skipNextShowRefresh = true;
    },
    async loadMenu(menuId) {
      try {
        const menu = await getMenuDetail(menuId);
        this.setData({
          menu,
          form: {
            name: menu.name,
            description: menu.description,
            theme: menu.theme,
            coverImage: menu.coverImage || '',
          },
        });
      } catch (error) {
        console.error('加载菜单设置失败', error);
      }
    },
    setCoverImage(value) {
      this.setData({
        form: {
          ...this.data.form,
          coverImage: value,
        },
      });
    },
    async onChooseCover() {
      if (this.data.coverUploading) {
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
      let filePath = '';
      let fileSize = 0;
      try {
        const res = await chooseImage();
        if (!res) {
          return;
        }
        if (res.tempFiles && res.tempFiles.length) {
          filePath = res.tempFiles[0].tempFilePath;
          fileSize = res.tempFiles[0].size || 0;
        } else if (res.tempFilePaths && res.tempFilePaths.length) {
          filePath = res.tempFilePaths[0];
        }
        if (!filePath) {
          return;
        }
      } catch (error) {
        if (error && error.errMsg && error.errMsg.includes('cancel')) {
          return;
        }
        console.error('选择菜单主图失败', error);
        wx.showToast({ title: '选择失败', icon: 'none' });
        return;
      }
      if (fileSize && fileSize > MAX_COVER_FILE_SIZE) {
        wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
        return;
      }
      await this.uploadCoverImage(filePath);
    },
    async uploadCoverImage(tempFilePath) {
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
      const cloudPath = `${MENU_COVER_DIR}/${menuId}-${timestamp}-${random}.${ext}`;
      this.setData({ coverUploading: true });
      wx.showLoading({ title: '上传中', mask: true });
      try {
        const result = await wx.cloud.uploadFile({
          cloudPath,
          filePath: tempFilePath,
        });
        if (!result || !result.fileID) {
          throw new Error('missing_file_id');
        }
        this.setCoverImage(result.fileID);
        wx.showToast({ title: '上传成功', icon: 'success' });
      } catch (error) {
        console.error('上传菜单主图失败', error);
        wx.showToast({ title: '上传失败', icon: 'none' });
      } finally {
        wx.hideLoading();
        this.setData({ coverUploading: false });
      }
    },
    onClearCover() {
      if (!this.data.form.coverImage) {
        return;
      }
      this.setCoverImage('');
    },
    onPreviewCover() {
      const cover = this.data.form.coverImage;
      if (!cover) {
        return;
      }
      wx.previewImage({
        urls: [cover],
        current: cover,
      });
    },
    async loadCategories(menuId) {
      try {
        const categories = await getCategoriesByMenu(menuId);
        const sorted = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        this.setData({ categories: sorted });
      } catch (error) {
        console.error('加载分类失败', error);
      }
    },
    async loadOptions(menuId) {
      try {
        const options = await getOptionsByMenu(menuId);
        this.setData({ options });
      } catch (error) {
        console.error('加载选项失败', error);
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
    onThemeChange(event) {
      const { value } = event.detail;
      this.setData({
        form: { ...this.data.form, theme: value },
      });
    },
    getOptionFormTemplate() {
      return {
        id: '',
        name: '',
        defaultChoice: '',
        choices: [],
      };
    },
    ensureOptionDefaultChoice(choices, desiredValue) {
      if (!Array.isArray(choices) || !choices.length) {
        return '';
      }
      const exists = choices.some((item) => item.value === desiredValue);
      return exists ? desiredValue : choices[0].value;
    },
    resetOptionForm() {
      this.setData({
        optionForm: this.getOptionFormTemplate(),
        optionChoiceInput: '',
        optionEditing: false,
      });
    },
    onStartCreateOption() {
      this.resetOptionForm();
    },
    onEditOption(event) {
      const { id } = event.currentTarget.dataset;
      const option = this.data.options.find((item) => item.id === id);
      if (!option) {
        return;
      }
      const defaultChoice = this.ensureOptionDefaultChoice(option.choices, option.defaultChoice);
      const restOption = { ...option };
      if (Object.prototype.hasOwnProperty.call(restOption, 'required')) {
        delete restOption.required;
      }
      this.setData({
        optionForm: { ...restOption, defaultChoice },
        optionChoiceInput: '',
        optionEditing: true,
      });
    },
    onOptionFormInput(event) {
      const { field } = event.currentTarget.dataset;
      this.setData({
        optionForm: { ...this.data.optionForm, [field]: event.detail.value },
      });
    },
    onOptionChoiceInput(event) {
      this.setData({ optionChoiceInput: event.detail.value });
    },
    onAddOptionChoice() {
      const label = (this.data.optionChoiceInput || '').trim();
      if (!label) {
        return;
      }
      const value = slugify(label) || label;
      const choice = { label, value, sortOrder: Date.now() };
      const nextChoices = [...this.data.optionForm.choices, choice];
      this.setData({
        optionForm: {
          ...this.data.optionForm,
          choices: nextChoices,
          defaultChoice: this.ensureOptionDefaultChoice(
            nextChoices,
            this.data.optionForm.defaultChoice || choice.value
          ),
        },
        optionChoiceInput: '',
      });
    },
    onRemoveOptionChoice(event) {
      const { value } = event.currentTarget.dataset;
      const nextChoices = this.data.optionForm.choices.filter((item) => item.value !== value);
      this.setData({
        optionForm: {
          ...this.data.optionForm,
          choices: nextChoices,
          defaultChoice: this.ensureOptionDefaultChoice(
            nextChoices,
            this.data.optionForm.defaultChoice
          ),
        },
      });
    },
    onOptionDefaultChoiceChange(event) {
      this.applyOptionDefaultChoice(event.detail.value);
    },
    onSelectOptionDefaultChoice(event) {
      const { value } = event.currentTarget.dataset;
      this.applyOptionDefaultChoice(value);
    },
    applyOptionDefaultChoice(value) {
      const { choices } = this.data.optionForm;
      if (!choices || !choices.length) {
        return;
      }
      if (!choices.some((item) => item.value === value)) {
        return;
      }
      this.setData({
        optionForm: { ...this.data.optionForm, defaultChoice: value },
      });
    },
    async onSaveOption() {
      const { activeMenuId } = store.getState();
      const { optionForm } = this.data;
      if (!activeMenuId) {
        return;
      }
      if (!optionForm.name || !optionForm.choices.length) {
        wx.showToast({ title: '请完善选项信息', icon: 'none' });
        return;
      }
      const defaultChoice = this.ensureOptionDefaultChoice(optionForm.choices, optionForm.defaultChoice);
      wx.showLoading({ title: '保存中', mask: true });
      try {
        await upsertOption({ ...optionForm, menuId: activeMenuId, defaultChoice });
        wx.showToast({ title: '已保存', icon: 'success' });
        await this.loadOptions(activeMenuId);
        this.resetOptionForm();
      } catch (error) {
        console.error('保存自定义选项失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },
    async onDeleteOption(event) {
      const { id } = event.currentTarget.dataset;
      if (!id) {
        return;
      }
      wx.showModal({
        title: '删除选项',
        content: '删除后将同步移除关联菜品中的该选项，确认继续？',
        confirmText: '删除',
        cancelText: '取消',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          wx.showLoading({ title: '删除中', mask: true });
          try {
            await deleteOption(id);
            wx.showToast({ title: '已删除', icon: 'success' });
            const { activeMenuId } = store.getState();
            if (activeMenuId) {
              await this.loadOptions(activeMenuId);
            }
            if (this.data.optionForm.id === id) {
              this.resetOptionForm();
            }
          } catch (error) {
            console.error('删除自定义选项失败', error);
            wx.showToast({ title: '操作失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        },
      });
    },
    async onSubmit() {
      const { form } = this.data;
      const { activeMenuId } = store.getState();
      if (!activeMenuId) return;
      this.setData({ saving: true });
      try {
        await updateMenuSettings(activeMenuId, form);
        store.setState({
          theme: form.theme,
        });
        themeManager.applyTheme(form.theme);
        wx.showToast({ title: '操作成功', icon: 'success' });
      } catch (error) {
        console.error('保存菜单设置失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      } finally {
        this.setData({ saving: false });
      }
    },
    onDeleteMenu() {
      const { activeMenuId, rolesByMenu } = store.getState();
      if (!activeMenuId) {
        return;
      }
      wx.showModal({
        title: '删除菜单',
        content: '删除后将移除该菜单及其所有分类与菜品，操作不可恢复。',
        confirmText: '删除',
        cancelText: '取消',
        success: async (res) => {
          if (!res.confirm) {
            return;
          }
          wx.showLoading({ title: '删除中', mask: true });
          try {
            const success = await deleteMenu(activeMenuId);
            if (!success) {
              throw new Error('delete_failed');
            }
            const nextRoles = { ...(rolesByMenu || {}) };
            delete nextRoles[activeMenuId];
            store.setState({
              activeMenuId: null,
              activeRole: null,
              rolesByMenu: nextRoles,
            });
            wx.showToast({ title: '已删除', icon: 'success' });
            wx.redirectTo({ url: '/pages/menu-selector/index' });
          } catch (error) {
            console.error('删除菜单失败', error);
            wx.showToast({ title: '删除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        },
      });
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
    onAddCategory() {
      const { activeMenuId } = store.getState();
      if (!activeMenuId) return;
      wx.showModal({
        title: '新增分类',
        editable: true,
        placeholderText: '输入分类名称',
        success: async (res) => {
          if (res.confirm) {
            const name = (res.content || '').trim();
            if (!name) return;
            try {
              await createCategory({ menuId: activeMenuId, name });
              wx.showToast({ title: '操作成功', icon: 'success' });
              await this.loadCategories(activeMenuId);
            } catch (error) {
              console.error('新增分类失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    onRenameCategory(event) {
      const { id } = event.currentTarget.dataset;
      if (!id) return;
      const category = this.data.categories.find((item) => item.id === id);
      if (!category) return;
      wx.showModal({
        title: '重命名分类',
        editable: true,
        placeholderText: category.name,
        success: async (res) => {
          if (res.confirm) {
            const name = (res.content || '').trim();
            if (!name || name === category.name) {
              return;
            }
            try {
              await updateCategory(id, { name });
              wx.showToast({ title: '操作成功', icon: 'success' });
              await this.loadCategories(store.getState().activeMenuId);
            } catch (error) {
              console.error('重命名分类失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    onDeleteCategory(event) {
      const { id } = event.currentTarget.dataset;
      if (!id) return;
      if (id === this.data.menu?.defaultCategoryId) {
        wx.showToast({ title: '默认分类不可删除', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '删除分类',
        content: '确认删除该分类？分类内菜品将移动至默认分类。',
        success: async (res) => {
          if (res.confirm) {
            try {
              await deleteCategory(id);
              wx.showToast({ title: '操作成功', icon: 'success' });
              await Promise.all([
                this.loadMenu(store.getState().activeMenuId),
                this.loadCategories(store.getState().activeMenuId),
              ]);
            } catch (error) {
              console.error('删除分类失败', error);
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        },
      });
    },
    async onMoveCategory(event) {
      const { id, direction } = event.currentTarget.dataset;
      const list = [...this.data.categories];
      const index = list.findIndex((item) => item.id === id);
      if (index === -1) return;
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= list.length) return;
      [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
      this.setData({ categories: list });
      try {
        const { activeMenuId } = store.getState();
        await sortCategories(activeMenuId, list.map((item) => item.id));
        wx.showToast({ title: '操作成功', icon: 'success' });
      } catch (error) {
        console.error('分类排序失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
        const { activeMenuId } = store.getState();
        if (activeMenuId) {
          await this.loadCategories(activeMenuId);
        }
      }
    },
    onTabChange(event) {
      const { key } = event.detail || {};
      if (!key || key === 'menuSettings') {
        return;
      }
      const target = ADMIN_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
  },
});
