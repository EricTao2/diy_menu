const getStore = () => {
  const app = typeof getApp === 'function' ? getApp() : null;
  if (app && typeof app.getStore === 'function') {
    return app.getStore();
  }
  return null;
};

export const getGlobalState = () => {
  const store = getStore();
  return store ? store.getState() : {};
};

export const setGlobalState = (nextState = {}) => {
  const store = getStore();
  if (store && typeof store.setState === 'function') {
    store.setState(nextState);
  }
};

export const getGlobalRole = () => {
  const state = getGlobalState();
  return state?.activeRole || '';
};

export const getStateSelector = (selector) => {
  if (typeof selector !== 'function') {
    return getGlobalState();
  }
  return selector(getGlobalState());
};
