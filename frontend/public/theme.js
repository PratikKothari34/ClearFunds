// Applied before first paint so a dark-mode phone never flashes white.
// An explicit choice overrides the system; absent storage is fine.
try {
  var t = localStorage.getItem('cf-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
