(() => {
  const preference = window.matchMedia('(prefers-color-scheme: light)');
  const updateAppearance = () => {
    const light = preference.matches;
    const theme = document.querySelector('meta[name="theme-color"]');
    const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (theme) theme.content = light ? '#edf2fb' : '#1a2347';
    if (statusBar) statusBar.content = light ? 'default' : 'black-translucent';
  };
  updateAppearance();
  if (preference.addEventListener) preference.addEventListener('change', updateAppearance);
  else preference.addListener(updateAppearance);
})();
