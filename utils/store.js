const createStore = (initialState = {}) => {
  let state = { ...initialState };
  const listeners = new Set();

  const getState = () => state;

  const setState = (partial) => {
    state = { ...state, ...partial };
    listeners.forEach((listener) => listener(state));
  };

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const reset = () => {
    state = { ...initialState };
    listeners.forEach((listener) => listener(state));
  };

  return {
    getState,
    setState,
    subscribe,
    reset,
  };
};

export { createStore };
