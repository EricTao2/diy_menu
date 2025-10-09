import { createPage } from '../../../utils/page';
import { resolveThemeClass } from '../../../utils/theme-helper';
import { getOptionsByMenu, upsertOption, deleteOption } from '../../../services/api';
import { ensureRole } from '../../../utils/auth';
import { ADMIN_BOTTOM_TABS } from '../../../common/admin-tabs';
const app = getApp();
const store = app.getStore();

const mapStoreToData = (state) => ({
  theme: state.theme,
  themeClass: resolveThemeClass(state.theme),
  activeMenuId: state.activeMenuId,
});

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const PAGE_TRANSITION_DURATION = 180;

const ADMIN_TAB_URL_MAP = ADMIN_BOTTOM_TABS.reduce((acc, tab) => {
  acc[tab.key] = tab.url;
  return acc;
}, {});

createPage({
  data: {
    options: [],
    form: {
      id: '',
      name: '',
      defaultChoice: '',
      choices: [],
    },
    choiceInput: '',
    editing: false,
    transitionClass: '',
  },
  mapStoreToData,
  async onLoad() {
    await this.loadOptions();
    this.hasLoaded = true;
    this.skipNextShowRefresh = true;
  },
  async onShow() {
    if (this.skipNextShowRefresh) {
      this.skipNextShowRefresh = false;
    } else if (this.hasLoaded) {
      await this.loadOptions();
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
    async loadOptions() {
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
      const options = await getOptionsByMenu(activeMenuId);
      this.setData({ options });
    },
    resetForm() {
      this.setData({
        form: {
          id: '',
          name: '',
          defaultChoice: '',
          choices: [],
        },
        choiceInput: '',
        editing: false,
      });
    },
    ensureDefaultChoice(choices, desiredValue) {
      if (!Array.isArray(choices) || choices.length === 0) {
        return '';
      }
      const exists = choices.some((item) => item.value === desiredValue);
      return exists ? desiredValue : choices[0].value;
    },
    startCreate() {
      this.resetForm();
    },
    startEdit(event) {
      const { id } = event.currentTarget.dataset;
      const option = this.data.options.find((item) => item.id === id);
      if (!option) return;
      const defaultChoice = this.ensureDefaultChoice(option.choices, option.defaultChoice);
      const restOption = { ...option };
      if (Object.prototype.hasOwnProperty.call(restOption, 'required')) {
        delete restOption.required;
      }
      this.setData({
        form: { ...restOption, defaultChoice },
        editing: true,
      });
    },
    onFormInput(event) {
      const { field } = event.currentTarget.dataset;
      this.setData({
        form: { ...this.data.form, [field]: event.detail.value },
      });
    },
    onChoiceInput(event) {
      this.setData({ choiceInput: event.detail.value });
    },
    addChoice() {
      const label = this.data.choiceInput.trim();
      if (!label) return;
      const value = slugify(label);
      const choice = {
        label,
        value: value || label,
        sortOrder: Date.now(),
      };
      const choices = [...this.data.form.choices, choice];
      this.setData({
        form: {
          ...this.data.form,
          choices,
          defaultChoice: this.ensureDefaultChoice(choices, this.data.form.defaultChoice || choice.value),
        },
        choiceInput: '',
      });
    },
    removeChoice(event) {
      const { value } = event.currentTarget.dataset;
      const choices = this.data.form.choices.filter((item) => item.value !== value);
      this.setData({
        form: {
          ...this.data.form,
          choices,
          defaultChoice: this.ensureDefaultChoice(choices, this.data.form.defaultChoice),
        },
      });
    },
    onDefaultChoiceChange(event) {
      const value = event.detail.value;
      this.applyDefaultChoice(value);
    },
    onSelectDefaultChoice(event) {
      const { value } = event.currentTarget.dataset;
      if (!value) return;
      this.applyDefaultChoice(value);
    },
    applyDefaultChoice(value) {
      const { choices } = this.data.form;
      if (!Array.isArray(choices) || choices.length === 0) {
        return;
      }
      if (!choices.some((item) => item.value === value)) {
        return;
      }
      this.setData({
        form: { ...this.data.form, defaultChoice: value },
      });
    },
    async onSave() {
      const { activeMenuId } = store.getState();
      const { form } = this.data;
      if (!form.name || form.choices.length === 0) {
        wx.showToast({ title: '操作失败', icon: 'none' });
        return;
      }
      const choices = form.choices;
      const defaultChoice = this.ensureDefaultChoice(choices, form.defaultChoice);
      try {
        await upsertOption({ ...form, menuId: activeMenuId, defaultChoice });
        wx.showToast({ title: '操作成功', icon: 'success' });
        await this.loadOptions();
        this.resetForm();
      } catch (error) {
        console.error('保存选项失败', error);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    },
    async onDelete(event) {
      const { id } = event.currentTarget.dataset;
      wx.showModal({
        title: '删除',
        content: '确认',
        success: async (res) => {
          if (res.confirm) {
            await deleteOption(id);
            wx.showToast({ title: '操作成功', icon: 'success' });
            this.loadOptions();
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
    onTabChange(event) {
      const { key } = event.detail || {};
      if (!key || key === 'optionLibrary') {
        return;
      }
      const target = ADMIN_TAB_URL_MAP[key];
      if (target) {
        wx.redirectTo({ url: target });
      }
    },
  },
});
