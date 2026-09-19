/* ==========================================================================
   app.js — entry point. Seeds demo data on first run, wires navigation and
   modals, initializes every feature module, then shows the Dashboard.
   App.refreshAll() is the one function every mutation (save/delete trade,
   save settings, save review, add/remove rule) calls afterward: it updates
   the topbar and re-runs whichever page's refresh callback is registered
   for the page currently on screen.
   ========================================================================== */
(function (global) {
  'use strict';

  function refreshAll() {
    global.UI.updateTopbar();
    global.UI.refreshCurrentPage();
  }

  function init() {
    global.Storage.seedDemoDataIfNeeded();
    var settings = global.Storage.getSettings();
    global.UI.applyTheme(settings.theme);
    global.Charts.initDefaults();

    global.UI.initNav();
    global.UI.initModals();

    global.TradeForm.init();
    global.Journal.init();
    global.Dashboard.init();
    global.CalendarPage.init();
    global.Reviews.init();
    global.Rules.init();
    global.Settings.init();

    global.UI.updateTopbar();
    global.UI.showPage('dashboard');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.App = { refreshAll: refreshAll };
})(window);
