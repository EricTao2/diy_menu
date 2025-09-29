const themes = {
  light: {
    id: 'light',
    name: '默认浅色',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
  dark: {
    id: 'dark',
    name: '夜间模式',
    navigationBarBackgroundColor: '#121212',
    navigationBarTextStyle: 'white',
  },
  forest: {
    id: 'forest',
    name: '森林绿',
    navigationBarBackgroundColor: '#356859',
    navigationBarTextStyle: 'white',
  },
};

export const createThemeManager = () => {
  let currentTheme = 'light';
  const listeners = new Set();

  const applyTheme = (themeId) => {
    if (!themes[themeId]) {
      console.warn(`未知主题: ${themeId}`);
      return;
    }
    currentTheme = themeId;
    const theme = themes[themeId];
    try {
      wx.setStorageSync('diy-menu-theme', themeId);
      wx.setNavigationBarColor({
        backgroundColor: theme.navigationBarBackgroundColor,
        frontColor: theme.navigationBarTextStyle === 'white' ? '#ffffff' : '#000000',
      });
    } catch (error) {
      console.error('主题应用失败', error);
    }
    listeners.forEach((listener) => listener(themeId));
  };

  const getCurrentTheme = () => currentTheme;

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const getAvailableThemes = () => Object.values(themes);

  return {
    applyTheme,
    getCurrentTheme,
    getAvailableThemes,
    subscribe,
  };
};
