import { initCloud } from './utils/cloud';
import { createStore } from './utils/store';
import { createThemeManager } from './utils/theme';
import { bootstrapMockData } from './services/api';
import { createNotifier } from './utils/notifier';

const store = createStore({
  user: null,
  activeMenuId: null,
  activeRole: null,
  rolesByMenu: {},
  theme: 'light',
});
const themeManager = createThemeManager();
const notifier = createNotifier();

App({
  globalData: {
    store,
    themeManager,
    notifier,
  },

  async onLaunch() {
    initCloud();
    await bootstrapMockData();
    this.restorePreferences();
  },

  restorePreferences() {
    const savedTheme = wx.getStorageSync('diy-menu-theme');
    if (savedTheme) {
      store.setState({ theme: savedTheme });
      themeManager.applyTheme(savedTheme);
    } else {
      themeManager.applyTheme(store.getState().theme);
    }
  },

  getStore() {
    return store;
  },

  getThemeManager() {
    return themeManager;
  },

  getNotifier() {
    return notifier;
  },
});
