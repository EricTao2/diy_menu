export const hasRole = (state, menuId, role) => {
  if (!state || !menuId) return false;
  const roles = state.rolesByMenu?.[menuId] || [];
  return roles.includes(role);
};

export const ensureRole = (state, menuId, role) => {
  const allowed = hasRole(state, menuId, role);
  if (!allowed) {
    wx.showToast({ title: '没有权限访问', icon: 'none' });
  }
  return allowed;
};
