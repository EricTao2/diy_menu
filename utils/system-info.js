let cachedWindowMetrics = null;

const readWindowInfo = () => {
  if (typeof wx.getWindowInfo === 'function') {
    try {
      return wx.getWindowInfo();
    } catch (err) {
      // fall through to other strategies
    }
  }

  const appBaseInfo = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : null;
  const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : null;

  if (appBaseInfo || deviceInfo) {
    const windowWidth =
      (appBaseInfo && typeof appBaseInfo.windowWidth === 'number' && appBaseInfo.windowWidth) ||
      (deviceInfo && typeof deviceInfo.windowWidth === 'number' && deviceInfo.windowWidth) ||
      (deviceInfo && typeof deviceInfo.screenWidth === 'number' && deviceInfo.screenWidth) ||
      0;
    const windowHeight =
      (appBaseInfo && typeof appBaseInfo.windowHeight === 'number' && appBaseInfo.windowHeight) ||
      (deviceInfo && typeof deviceInfo.windowHeight === 'number' && deviceInfo.windowHeight) ||
      (deviceInfo && typeof deviceInfo.screenHeight === 'number' && deviceInfo.screenHeight) ||
      0;
    const safeArea = (appBaseInfo && appBaseInfo.safeArea) || (deviceInfo && deviceInfo.safeArea) || null;
    const pixelRatio =
      (deviceInfo && typeof deviceInfo.pixelRatio === 'number' && deviceInfo.pixelRatio) ||
      (appBaseInfo && typeof appBaseInfo.pixelRatio === 'number' && appBaseInfo.pixelRatio) ||
      0;

    if (windowWidth && windowHeight) {
      return {
        windowWidth,
        windowHeight,
        screenWidth: deviceInfo?.screenWidth,
        screenHeight: deviceInfo?.screenHeight,
        pixelRatio,
        safeArea,
      };
    }
  }

  if (typeof wx.getSystemInfoSync === 'function') {
    try {
      return wx.getSystemInfoSync();
    } catch (err) {
      // ignore legacy failures
    }
  }

  return null;
};

export const getWindowMetrics = () => {
  if (cachedWindowMetrics) {
    return cachedWindowMetrics;
  }
  cachedWindowMetrics = readWindowInfo() || {
    windowWidth: 0,
    windowHeight: 0,
    pixelRatio: 0,
    safeArea: null,
  };
  return cachedWindowMetrics;
};

export const resetWindowMetricsCache = () => {
  cachedWindowMetrics = null;
};

export const getRpxRatio = () => {
  const metrics = getWindowMetrics();
  const width = metrics?.windowWidth || 0;
  return width ? width / 750 : 1;
};
