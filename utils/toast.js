const DEFAULT_DURATION = 1800;

const ICON_MAP = {
  success: 'success',
  info: 'none',
  warning: 'none',
  error: 'none',
};

/**
 * 统一顾客端提示样式，封装 wx.showToast。
 * @param {Object} options
 * @param {string} options.title - 提示文案
 * @param {'success'|'info'|'warning'|'error'} [options.type='info'] - 提示类型
 * @param {number} [options.duration=DEFAULT_DURATION] - 展示时长，单位 ms
 * @param {boolean} [options.mask=true] - 是否显示透明蒙层
 */
export const showCustomerToast = ({
  title = '',
  type = 'info',
  duration = DEFAULT_DURATION,
  mask = true,
} = {}) => {
  if (!title) return;
  const icon = ICON_MAP[type] || ICON_MAP.info;
  wx.showToast({
    title,
    icon,
    duration,
    mask,
  });
};

export const hideCustomerToast = () => {
  wx.hideToast();
};
