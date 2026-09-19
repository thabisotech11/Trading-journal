/* ==========================================================================
   settings.js — account + risk + session configuration, the storage-usage
   meter, and the data actions (CSV export, JSON backup/restore, demo-data
   clear, full reset).
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG, Storage = global.Storage, UI = global.UI;
  var qs = UI.qs;

  function renderSessionSettings(sessions) {
    var container = qs('#settings-sessions-container');
    container.innerHTML = CFG.SESSION_ORDER.map(function (key) {
      var s = sessions[key] || CFG.DEFAULT_SESSIONS[key];
      return '<div class="field"><label>' + CFG.DEFAULT_SESSIONS[key].label + ' \u2014 Start</label><input type="time" class="input" data-session-start="' + key + '" value="' + s.start + '" /></div>' +
        '<div class="field"><label>' + CFG.DEFAULT_SESSIONS[key].label + ' \u2014 End</label><input type="time" class="input" data-session-end="' + key + '" value="' + s.end + '" /></div>';
    }).join('');
  }
  function renderStorageMeter() {
    var bytes = Storage.estimateUsageBytes();
    var capBytes = 5 * 1024 * 1024;
    var pct = Math.min(100, bytes / capBytes * 100);
    var fill = qs('#storage-meter-fill');
    fill.style.width = pct.toFixed(1) + '%';
    fill.className = 'storage-meter-fill' + (pct > 85 ? ' danger' : pct > 60 ? ' warn' : '');
    qs('#storage-meter-label').textContent = Math.round(bytes / 1024).toLocaleString() + ' KB used of an approximate 5 MB browser limit \u2014 screenshots are compressed automatically to help this go further.';
  }
  function populateForm() {
    var s = Storage.getSettings();
    qs('#st-accountName').value = s.accountName || '';
    qs('#st-traderName').value = s.traderName || '';
    qs('#st-startingBalance').value = s.startingBalance;
    UI.fillSelect('#st-currency', Object.keys(CFG.CURRENCIES).map(function (c) { return { value: c, label: c + ' (' + CFG.CURRENCIES[c].symbol + ')' }; }));
    qs('#st-currency').value = s.currency;
    UI.fillSelect('#st-dateFormat', CFG.DATE_FORMATS.map(function (f) { return { value: f, label: f }; }));
    qs('#st-dateFormat').value = s.dateFormat;
    qs('#st-theme').value = s.theme;
    qs('#st-positionSizeUnit').value = s.positionSizeUnit || '';
    qs('#st-maxRiskPercent').value = s.maxRiskPercent;
    qs('#st-minRR').value = s.minRR;
    qs('#st-maxDailyLossR').value = s.maxDailyLossR;
    renderSessionSettings(s.sessions);
    renderStorageMeter();
  }

  function downloadFile(filename, content, mime) {
    try {
      var blob = new Blob([content], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      console.error('[Settings] download failed', e);
      UI.toast('Could not generate the download in this browser.', 'error');
    }
  }
  function csvEscape(v) {
    if (v === null || v === undefined) return '';
    v = String(v).replace(/"/g, '""');
    return /[",\n]/.test(v) ? '"' + v + '"' : v;
  }
  function tradesToCsv(trades) {
    var cols = ['id', 'status', 'date', 'tradingDay', 'session', 'direction', 'market', 'timeframe', 'entryTime', 'exitTime',
      'entryPrice', 'stopLoss', 'takeProfit', 'exitPrice', 'positionSize', 'riskAmount', 'riskPercent', 'pnl', 'rMultiple',
      'commission', 'result', 'setup', 'setupGrade', 'confidence', 'confluenceScore', 'disciplineScore', 'ruleCompliance', 'notes'];
    var lines = [cols.join(',')];
    trades.forEach(function (t) {
      var row = cols.map(function (c) {
        var v;
        if (c === 'disciplineScore') v = t.psychology && t.psychology.disciplineScore;
        else if (c === 'ruleCompliance') v = t.ruleCompliance ? (t.ruleCompliance.compliant + '/' + t.ruleCompliance.total) : '';
        else v = t[c];
        return csvEscape(v);
      });
      lines.push(row.join(','));
    });
    return lines.join('\r\n');
  }

  function wireForm() {
    qs('#settings-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var sessions = {};
      CFG.SESSION_ORDER.forEach(function (key) {
        sessions[key] = {
          label: CFG.DEFAULT_SESSIONS[key].label,
          start: qs('[data-session-start="' + key + '"]').value || CFG.DEFAULT_SESSIONS[key].start,
          end: qs('[data-session-end="' + key + '"]').value || CFG.DEFAULT_SESSIONS[key].end
        };
      });
      var newSettings = {
        accountName: qs('#st-accountName').value.trim() || 'US30 Trading Account',
        traderName: qs('#st-traderName').value.trim(),
        startingBalance: Number(qs('#st-startingBalance').value) || 0,
        currency: qs('#st-currency').value,
        dateFormat: qs('#st-dateFormat').value,
        theme: qs('#st-theme').value,
        positionSizeUnit: qs('#st-positionSizeUnit').value.trim() || 'lots',
        maxRiskPercent: Number(qs('#st-maxRiskPercent').value) > 0 ? Number(qs('#st-maxRiskPercent').value) : 1,
        minRR: Number(qs('#st-minRR').value) > 0 ? Number(qs('#st-minRR').value) : 1,
        maxDailyLossR: Number(qs('#st-maxDailyLossR').value) > 0 ? Number(qs('#st-maxDailyLossR').value) : 1,
        sessions: sessions
      };
      Storage.saveSettings(newSettings);
      UI.applyTheme(newSettings.theme);
      UI.updateTopbar();
      if (global.App && global.App.refreshAll) global.App.refreshAll();
      UI.toast('Settings saved.', 'success');
    });
  }
  function wireDataActions() {
    qs('#btn-export-csv').addEventListener('click', function () {
      downloadFile('us30-journal-' + UI.todayIso() + '.csv', tradesToCsv(Storage.getTrades()), 'text/csv');
      UI.toast('CSV exported.', 'success');
    });
    qs('#btn-export-json').addEventListener('click', function () {
      var payload = {
        exportedAt: new Date().toISOString(), version: 1,
        trades: Storage.getTrades(), settings: Storage.getSettings(), rules: Storage.getRules(),
        dailyReviews: Storage.getReviews('dailyReviews'), weeklyReviews: Storage.getReviews('weeklyReviews'), monthlyReviews: Storage.getReviews('monthlyReviews')
      };
      downloadFile('us30-journal-backup-' + UI.todayIso() + '.json', JSON.stringify(payload, null, 2), 'application/json');
      UI.toast('JSON backup downloaded.', 'success');
    });
    qs('#btn-import-json').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var data;
        try { data = JSON.parse(reader.result); } catch (err) { UI.toast('That file is not valid JSON.', 'error'); return; }
        if (!data || !Array.isArray(data.trades)) { UI.toast('This file does not look like a US30 Journal backup.', 'error'); return; }
        UI.showConfirm('Import journal data?', 'This replaces all current trades, settings and rules with the contents of this file. Export a backup first if you want to keep what you have.', function () {
          Storage.saveTrades(data.trades);
          if (data.settings) Storage.saveSettings(data.settings);
          if (data.rules) Storage.saveRules(data.rules);
          if (data.dailyReviews) localStorage.setItem(Storage.KEYS.dailyReviews, JSON.stringify(data.dailyReviews));
          if (data.weeklyReviews) localStorage.setItem(Storage.KEYS.weeklyReviews, JSON.stringify(data.weeklyReviews));
          if (data.monthlyReviews) localStorage.setItem(Storage.KEYS.monthlyReviews, JSON.stringify(data.monthlyReviews));
          UI.applyTheme(Storage.getSettings().theme);
          populateForm();
          if (global.App && global.App.refreshAll) global.App.refreshAll();
          UI.toast('Journal data imported.', 'success');
        }, 'Import & Replace');
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    qs('#btn-clear-demo').addEventListener('click', function () {
      UI.showConfirm('Clear demo data?', "This removes all labeled demo trades and keeps any real trades you've logged.", function () {
        Storage.clearDemoData();
        renderStorageMeter();
        if (global.App && global.App.refreshAll) global.App.refreshAll();
        UI.toast('Demo data cleared.', 'info');
      }, 'Clear');
    });
    qs('#btn-wipe-all').addEventListener('click', function () {
      UI.showConfirm('Reset ALL data?', 'This permanently deletes every trade, setting and rule stored in this browser. This cannot be undone.', function () {
        Storage.wipeAll();
        location.reload();
      }, 'Reset Everything');
    });
  }

  function init() {
    populateForm();
    wireForm();
    wireDataActions();
    UI.registerPageRefresh('settings', populateForm);
  }

  global.Settings = { init: init, populateForm: populateForm };
})(window);
