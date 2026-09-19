/* ==========================================================================
   ui.js — DOM plumbing shared by every feature module: navigation, modals,
   toasts, formatting, and the topbar refresh. No trade/business logic lives
   here; it only renders values calculations.js and storage.js hand it.
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG, Calc = global.Calc, Storage = global.Storage;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  // ---- Formatting -----------------------------------------------------------
  function formatCurrency(value, currencyCode) {
    if (value === null || value === undefined || isNaN(value)) return '\u2014';
    var settings = Storage.getSettings();
    var code = currencyCode || settings.currency;
    var symbol = (CFG.CURRENCIES[code] || CFG.CURRENCIES.USD).symbol;
    var sign = value < 0 ? '-' : '';
    var abs = Math.abs(value);
    return sign + symbol + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatR(value) {
    if (value === null || value === undefined || isNaN(value)) return '\u2014';
    return (value >= 0 ? '+' : '') + value.toFixed(2) + 'R';
  }
  function formatPercent(value, decimals) {
    if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '\u2014';
    return value.toFixed(decimals === undefined ? 1 : decimals) + '%';
  }
  function formatProfitFactor(value) {
    if (value === null || value === undefined) return '\u2014';
    if (value === Infinity) return '\u221E';
    return value.toFixed(2);
  }
  function formatNumber(value, decimals) {
    if (value === null || value === undefined || isNaN(value)) return '\u2014';
    return value.toFixed(decimals === undefined ? 1 : decimals);
  }
  function formatDate(dateStr, fmt) {
    if (!dateStr) return '\u2014';
    var p = dateStr.split('-');
    if (p.length !== 3) return dateStr;
    fmt = fmt || Storage.getSettings().dateFormat;
    if (fmt === 'DD/MM/YYYY') return p[2] + '/' + p[1] + '/' + p[0];
    if (fmt === 'MM/DD/YYYY') return p[1] + '/' + p[2] + '/' + p[0];
    return p[0] + '-' + p[1] + '-' + p[2];
  }
  function formatMinutes(mins) {
    if (mins === null || mins === undefined) return '\u2014';
    var h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
  }
  function confluenceTier(pct) {
    if (pct >= 55) return 'Exceptional';
    if (pct >= 40) return 'Strong';
    if (pct >= 22) return 'Moderate';
    return 'Low';
  }
  function toneClass(value) { return value > 0 ? 'positive' : value < 0 ? 'negative' : ''; }

  function fillSelect(sel, options) {
    var el = typeof sel === 'string' ? qs(sel) : sel;
    if (!el) return;
    el.innerHTML = options.map(function (o) { return '<option value="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + '</option>'; }).join('');
  }

  // ---- Navigation -------------------------------------------------------------
  var pageRefreshCallbacks = {};
  var currentPage = 'dashboard';
  function registerPageRefresh(pageKey, fn) { pageRefreshCallbacks[pageKey] = fn; }
  function showPage(pageKey) {
    var target = document.getElementById('page-' + pageKey);
    if (!target) return;
    qsa('.page').forEach(function (p) { p.classList.add('hidden'); });
    target.classList.remove('hidden');
    qsa('.nav-link').forEach(function (a) { a.classList.toggle('active', a.dataset.page === pageKey); });
    currentPage = pageKey;
    closeSidebarMobile();
    window.scrollTo(0, 0);
    if (pageRefreshCallbacks[pageKey]) {
      try { pageRefreshCallbacks[pageKey](); } catch (e) { console.error('[UI] page refresh failed:', pageKey, e); }
    }
  }
  function getCurrentPage() { return currentPage; }
  function refreshCurrentPage() { if (pageRefreshCallbacks[currentPage]) pageRefreshCallbacks[currentPage](); }
  function closeSidebarMobile() { document.body.classList.remove('sidebar-open'); }
  function initNav() {
    qsa('.nav-link').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); showPage(a.dataset.page); });
    });
    qsa('[data-nav]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); showPage(el.dataset.nav); });
    });
    var toggle = qs('#sidebar-toggle');
    if (toggle) toggle.addEventListener('click', function () { document.body.classList.toggle('sidebar-open'); });
    var backdrop = qs('#sidebar-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeSidebarMobile);
  }

  // ---- Modals -------------------------------------------------------------
  function openModal(id) { var m = document.getElementById(id); if (m) { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; } }
  function closeModal(id) { var m = document.getElementById(id); if (m) { m.classList.add('hidden'); document.body.style.overflow = ''; } }
  function initModals() {
    qsa('[data-close-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeModal(btn.dataset.closeModal); });
    });
    qsa('.modal-overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(ov.id); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') qsa('.modal-overlay:not(.hidden)').forEach(function (ov) { closeModal(ov.id); });
    });
  }
  function showConfirm(title, message, onConfirm, okLabel) {
    qs('#confirm-title').textContent = title;
    qs('#confirm-message').textContent = message;
    var okBtn = qs('#confirm-ok-btn');
    okBtn.textContent = okLabel || 'Confirm';
    var freshOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(freshOk, okBtn);
    freshOk.addEventListener('click', function () { closeModal('modal-confirm'); onConfirm(); });
    qs('#confirm-cancel-btn').onclick = function () { closeModal('modal-confirm'); };
    openModal('modal-confirm');
  }

  // ---- Toasts -------------------------------------------------------------
  function toast(message, type) {
    var container = qs('#toast-container');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  // ---- Tabs -----------------------------------------------------------------
  function initTabs(tabsSelector, panelsSelector, onChange) {
    var container = qs(tabsSelector);
    if (!container) return;
    qsa('button', container).forEach(function (btn) {
      btn.addEventListener('click', function () {
        qsa('button', container).forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        qsa(panelsSelector).forEach(function (p) { p.classList.toggle('active', p.dataset.panel === btn.dataset.tab); });
        if (onChange) onChange(btn.dataset.tab);
      });
    });
  }
  function setActiveTab(tabsSelector, panelsSelector, tabKey) {
    var container = qs(tabsSelector);
    if (!container) return;
    qsa('button', container).forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tabKey); });
    qsa(panelsSelector).forEach(function (p) { p.classList.toggle('active', p.dataset.panel === tabKey); });
  }

  // ---- Theme ----------------------------------------------------------------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  }

  // ---- Image compression (screenshots) --------------------------------------
  function compressImage(file, maxWidth, quality) {
    maxWidth = maxWidth || 1000; quality = quality || 0.72;
    return new Promise(function (resolve, reject) {
      if (!file) { resolve(null); return; }
      if (!/^image\//.test(file.type)) { reject(new Error('Not an image file')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read the file')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Could not decode the image')); };
        img.onload = function () {
          var scale = Math.min(1, maxWidth / img.width);
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          try { resolve(canvas.toDataURL('image/jpeg', quality)); }
          catch (e) { reject(e); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- Topbar -----------------------------------------------------------------
  function updateTopbar() {
    var trades = Storage.getTrades();
    var settings = Storage.getSettings();
    var balance = Calc.calcCurrentBalance(trades, settings.startingBalance);
    var balEl = qs('#topbar-balance'); if (balEl) balEl.textContent = formatCurrency(balance, settings.currency);
    var nameEl = qs('#header-account-name'); if (nameEl) nameEl.textContent = settings.accountName || 'US30 Trading Journal';

    var todayStr = todayIso();
    var todayClosed = trades.filter(function (t) { return t.date === todayStr && t.status === 'closed' && Calc.isNum(t.pnl); });
    var dailyPnl = todayClosed.reduce(function (s, t) { return s + t.pnl; }, 0);
    var dailyEl = qs('#topbar-daily-pnl');
    if (dailyEl) { dailyEl.textContent = formatCurrency(dailyPnl, settings.currency); dailyEl.className = 'topbar-value ' + toneClass(dailyPnl); }

    var wr = Calc.calcWinRate(trades);
    var wrEl = qs('#topbar-winrate'); if (wrEl) wrEl.textContent = wr === null ? '\u2014' : formatPercent(wr, 0);

    var closedChrono = Calc.sortChrono(trades.filter(function (t) { return t.status === 'closed' && t.result; }));
    var lastStreak = 0, lastType = null;
    for (var i = closedChrono.length - 1; i >= 0; i--) {
      var r = closedChrono[i].result;
      if (r === 'breakeven') break;
      if (lastType === null) { lastType = r; lastStreak = 1; }
      else if (r === lastType) { lastStreak++; }
      else break;
    }
    var streakEl = qs('#topbar-streak');
    if (streakEl) streakEl.textContent = lastStreak ? (lastType === 'win' ? 'W' : 'L') + lastStreak : '\u2014';

    var dayR = todayClosed.reduce(function (s, t) { return s + (typeof t.rMultiple === 'number' ? t.rMultiple : 0); }, 0);
    var stopWrap = qs('#topbar-daily-stop-wrap');
    if (stopWrap) stopWrap.style.display = (dayR <= -settings.maxDailyLossR) ? 'flex' : 'none';
  }

  global.UI = {
    qs: qs, qsa: qsa, todayIso: todayIso, pad: pad, escapeHtml: escapeHtml, debounce: debounce, fillSelect: fillSelect,
    formatCurrency: formatCurrency, formatR: formatR, formatPercent: formatPercent,
    formatProfitFactor: formatProfitFactor, formatNumber: formatNumber, formatDate: formatDate,
    formatMinutes: formatMinutes, confluenceTier: confluenceTier, toneClass: toneClass,
    registerPageRefresh: registerPageRefresh, showPage: showPage, getCurrentPage: getCurrentPage,
    refreshCurrentPage: refreshCurrentPage, closeSidebarMobile: closeSidebarMobile, initNav: initNav,
    openModal: openModal, closeModal: closeModal, initModals: initModals, showConfirm: showConfirm,
    toast: toast, initTabs: initTabs, setActiveTab: setActiveTab, applyTheme: applyTheme,
    compressImage: compressImage, updateTopbar: updateTopbar
  };
})(window);
