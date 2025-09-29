export const resolveThemeClass = (theme) => {
  if (!theme) return '';
  return `theme-${theme}`;
};
