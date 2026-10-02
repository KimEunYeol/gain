const root = document.getElementById('root')!;

if (window.location.pathname.startsWith('/admin')) {
  void import('./AdminVuetify').then(({ mountAdmin }) => mountAdmin(root));
} else {
  void Promise.all([
    import('react'),
    import('react-dom/client'),
    import('react-router-dom'),
    import('./App'),
    import('./styles.css'),
  ]).then(([React, ReactDOM, { BrowserRouter }, { default: App }]) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>,
    );
  });
}
