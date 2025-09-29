export const initCloud = () => {
  if (!wx.cloud) {
    console.warn('当前基础库不支持云开发能力');
    return;
  }
  if (initCloud.initialized) {
    return;
  }
  try {
    wx.cloud.init({
      traceUser: true,
    });
    initCloud.initialized = true;
  } catch (error) {
    console.error('云开发初始化失败', error);
  }
};

initCloud.initialized = false;

export const callCloudFunction = async ({ name, data = {} }) => {
  if (!wx.cloud || !initCloud.initialized) {
    throw new Error('cloud_not_ready');
  }
  return wx.cloud.callFunction({ name, data });
};
