const safeMapStoreToData = (mapper, state) => {
  if (typeof mapper !== 'function') {
    return {};
  }
  try {
    return mapper(state) || {};
  } catch (error) {
    console.error('mapStoreToData 执行失败', error);
    return {};
  }
};

export const createPage = (config) => {
  const {
    mapStoreToData,
    methods = {},
    onLoad,
    onUnload,
    onShow,
    onHide,
    ...rest
  } = config;
  const app = getApp();
  const store = app.getStore();
  let unsubscribe = null;

  const updateFromStore = (pageInstance) => {
    if (!mapStoreToData) return;
    const mapped = safeMapStoreToData(mapStoreToData, store.getState());
    pageInstance.setData(mapped);
  };

  Page({
    ...rest,
    ...methods,
    onLoad(options) {
      if (mapStoreToData) {
        unsubscribe = store.subscribe(() => updateFromStore(this));
        updateFromStore(this);
      }
      if (typeof onLoad === 'function') {
        onLoad.call(this, options);
      }
    },
    onUnload() {
      if (typeof onUnload === 'function') {
        onUnload.call(this);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    },
    onShow() {
      if (mapStoreToData) {
        updateFromStore(this);
      }
      if (typeof onShow === 'function') {
        onShow.call(this);
      }
    },
    onHide() {
      if (typeof onHide === 'function') {
        onHide.call(this);
      }
    },
  });
};
