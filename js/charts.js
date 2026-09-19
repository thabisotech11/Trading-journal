/* ==========================================================================
   charts.js — every Chart.js instance in the app. Colors are read from the
   live CSS variables so charts follow the active theme; a registry keyed by
   canvas id destroys the previous instance before drawing a new one so
   repeated page visits don't leak canvases or throw "already in use" errors.
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG, Calc = global.Calc;
  var instances = {};

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function initDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
    Chart.defaults.color = cssVar('--ink-muted') || '#8D95A8';
    Chart.defaults.borderColor = cssVar('--line-soft') || '#1B212B';
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
  }

  function draw(canvasId, config) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;
    if (instances[canvasId]) { instances[canvasId].destroy(); }
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options || {});
    var chart = new Chart(canvas.getContext('2d'), config);
    instances[canvasId] = chart;
    return chart;
  }

  function moneyTicks() {
    return { callback: function (v) { return (v < 0 ? '-' : '') + Math.abs(v).toLocaleString(); } };
  }
  function signColor(v) { return v >= 0 ? cssVar('--profit') : cssVar('--loss'); }
  function monoTick() { return { font: { family: "'IBM Plex Mono', monospace" } }; }

  // ---- Equity curve --------------------------------------------------------
  function renderEquity(canvasId, trades, startingBalance) {
    var points = Calc.buildEquityCurve(trades, startingBalance);
    var labels = points.map(function (p, i) { return i === 0 ? 'Start' : p.date; });
    var data = points.map(function (p) { return Math.round(p.equity * 100) / 100; });
    draw(canvasId, {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Equity', data: data, borderColor: cssVar('--gold'), backgroundColor: 'rgba(201,162,39,0.12)', fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 }] },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, ...monoTick() }, grid: { display: false } },
          y: { ticks: Object.assign(moneyTicks(), monoTick()), grid: { color: cssVar('--line-soft') } }
        }
      }
    });
  }

  // ---- Drawdown curve --------------------------------------------------------
  function renderDrawdown(canvasId, trades, startingBalance) {
    var points = Calc.buildEquityCurve(trades, startingBalance);
    var labels = points.map(function (p, i) { return i === 0 ? 'Start' : p.date; });
    var data = points.map(function (p) { return Math.round(p.drawdownPct * -100) / 100; });
    draw(canvasId, {
      type: 'line',
      data: { labels: labels, datasets: [{ label: 'Drawdown %', data: data, borderColor: cssVar('--loss'), backgroundColor: 'rgba(224,85,90,0.14)', fill: true, tension: 0.2, pointRadius: 0, borderWidth: 2 }] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return Math.abs(c.parsed.y).toFixed(1) + '% below peak'; } } } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, ...monoTick() }, grid: { display: false } },
          y: { suggestedMax: 0, ticks: { callback: function (v) { return Math.abs(v) + '%'; }, ...monoTick() }, grid: { color: cssVar('--line-soft') } }
        }
      }
    });
  }

  // ---- Period P&L bars (daily/weekly/monthly) --------------------------------
  function renderPeriodPnl(canvasId, trades, periodKeyFn) {
    var closed = Calc.closedWithPnl(trades);
    var groups = Calc.groupBy(closed, periodKeyFn);
    var keys = Object.keys(groups).sort();
    var data = keys.map(function (k) { return Math.round(groups[k].reduce(function (s, t) { return s + t.pnl; }, 0) * 100) / 100; });
    draw(canvasId, {
      type: 'bar',
      data: { labels: keys, datasets: [{ label: 'P&L', data: data, backgroundColor: data.map(signColor), borderRadius: 3, maxBarThickness: 34 }] },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 10, ...monoTick() }, grid: { display: false } },
          y: { ticks: Object.assign(moneyTicks(), monoTick()), grid: { color: cssVar('--line-soft') } }
        }
      }
    });
  }

  // ---- Win / Loss / Breakeven distribution -----------------------------------
  function renderWinLoss(canvasId, trades) {
    var closed = Calc.closedWithPnl(trades);
    var wins = closed.filter(function (t) { return t.result === 'win'; }).length;
    var losses = closed.filter(function (t) { return t.result === 'loss'; }).length;
    var be = closed.length - wins - losses;
    draw(canvasId, {
      type: 'doughnut',
      data: {
        labels: ['Wins', 'Losses', 'Breakeven'],
        datasets: [{ data: [wins, losses, be], backgroundColor: [cssVar('--profit'), cssVar('--loss'), cssVar('--ink-faint')], borderWidth: 0 }]
      },
      options: { plugins: { legend: { position: 'bottom' } }, cutout: '65%' }
    });
  }

  // ---- R-multiple distribution -----------------------------------------------
  function renderRDistribution(canvasId, trades) {
    var closed = trades.filter(function (t) { return t.status === 'closed' && Calc.isNum(t.rMultiple); });
    var buckets = [
      { label: '< -2R', test: function (r) { return r < -2; } },
      { label: '-2R to -1R', test: function (r) { return r >= -2 && r < -1; } },
      { label: '-1R to 0R', test: function (r) { return r >= -1 && r < 0; } },
      { label: '0R', test: function (r) { return r === 0; } },
      { label: '0R to 1R', test: function (r) { return r > 0 && r <= 1; } },
      { label: '1R to 2R', test: function (r) { return r > 1 && r <= 2; } },
      { label: '2R to 3R', test: function (r) { return r > 2 && r <= 3; } },
      { label: '> 3R', test: function (r) { return r > 3; } }
    ];
    var counts = buckets.map(function (b) { return closed.filter(function (t) { return b.test(t.rMultiple); }).length; });
    var colors = buckets.map(function (b) { return b.label.indexOf('-') === 0 || b.label.charAt(0) === '<' || b.label.charAt(0) === '-' ? cssVar('--loss') : (b.label === '0R' ? cssVar('--ink-faint') : cssVar('--profit')); });
    draw(canvasId, {
      type: 'bar',
      data: { labels: buckets.map(function (b) { return b.label; }), datasets: [{ label: 'Trades', data: counts, backgroundColor: colors, borderRadius: 3 }] },
      options: {
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: monoTick() }, y: { ticks: Object.assign({ precision: 0 }, monoTick()), grid: { color: cssVar('--line-soft') } } }
      }
    });
  }

  // ---- Session performance ----------------------------------------------------
  function renderSessionPerformance(canvasId, trades) {
    var bySession = Calc.groupBy(trades, function (t) { return t.session; });
    var keys = CFG.SESSION_ORDER.filter(function (k) { return bySession[k] && bySession[k].length; });
    var data = keys.map(function (k) { return Math.round(Calc.aggregateStats(bySession[k]).netPnl * 100) / 100; });
    var labels = keys.map(function (k) { return CFG.DEFAULT_SESSIONS[k].label; });
    draw(canvasId, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Net P&L', data: data, backgroundColor: data.map(signColor), borderRadius: 3 }] },
      options: {
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: monoTick() }, y: { ticks: Object.assign(moneyTicks(), monoTick()), grid: { color: cssVar('--line-soft') } } }
      }
    });
  }

  // ---- Setup performance -------------------------------------------------------
  function renderSetupPerformance(canvasId, trades) {
    var bySetup = Calc.groupBy(trades, function (t) { return t.setup; });
    var rows = Object.keys(bySetup).map(function (k) {
      var stats = Calc.aggregateStats(bySetup[k]);
      var m = CFG.SETUP_TYPES.filter(function (s) { return s.key === k; });
      return { label: m.length ? m[0].label : k, avgR: stats.avgR || 0, n: stats.closedCount };
    }).filter(function (r) { return r.n > 0; });
    rows.sort(function (a, b) { return b.avgR - a.avgR; });
    draw(canvasId, {
      type: 'bar',
      data: { labels: rows.map(function (r) { return r.label; }), datasets: [{ label: 'Avg R', data: rows.map(function (r) { return Math.round(r.avgR * 100) / 100; }), backgroundColor: rows.map(function (r) { return signColor(r.avgR); }), borderRadius: 3 }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { ticks: monoTick(), grid: { color: cssVar('--line-soft') } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } }
      }
    });
  }

  // ---- Long vs Short -------------------------------------------------------------
  function renderLongShort(canvasId, trades) {
    var buys = trades.filter(function (t) { return t.direction === 'buy'; });
    var sells = trades.filter(function (t) { return t.direction === 'sell'; });
    var buyStats = Calc.aggregateStats(buys), sellStats = Calc.aggregateStats(sells);
    var data = [Math.round((buyStats.netPnl || 0) * 100) / 100, Math.round((sellStats.netPnl || 0) * 100) / 100];
    draw(canvasId, {
      type: 'bar',
      data: { labels: ['Buy (Long)', 'Sell (Short)'], datasets: [{ label: 'Net P&L', data: data, backgroundColor: data.map(signColor), borderRadius: 3, maxBarThickness: 60 }] },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { afterLabel: function (c) { var s = c.dataIndex === 0 ? buyStats : sellStats; return 'Win rate: ' + (s.winRate !== null ? s.winRate.toFixed(0) + '%' : '\u2014') + ' \u00B7 ' + s.closedCount + ' trades'; } } }
        },
        scales: { x: { grid: { display: false }, ticks: monoTick() }, y: { ticks: Object.assign(moneyTicks(), monoTick()), grid: { color: cssVar('--line-soft') } } }
      }
    });
  }

  // ---- Time-of-day performance ------------------------------------------------
  function renderTimeOfDay(canvasId, trades) {
    var closed = Calc.closedWithPnl(trades).filter(function (t) { return t.entryTime; });
    var byHour = Calc.groupBy(closed, function (t) { return t.entryTime.split(':')[0]; });
    var hours = Object.keys(byHour).sort(function (a, b) { return Number(a) - Number(b); });
    var data = hours.map(function (h) { return Math.round(Calc.aggregateStats(byHour[h]).netPnl * 100) / 100; });
    draw(canvasId, {
      type: 'bar',
      data: { labels: hours.map(function (h) { return h + ':00'; }), datasets: [{ label: 'Net P&L', data: data, backgroundColor: data.map(signColor), borderRadius: 3, maxBarThickness: 28 }] },
      options: {
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: monoTick() }, y: { ticks: Object.assign(moneyTicks(), monoTick()), grid: { color: cssVar('--line-soft') } } }
      }
    });
  }

  function renderDashboardCharts(trades, startingBalance) {
    initDefaults();
    renderEquity('chart-dash-equity', trades, startingBalance);
    renderDrawdown('chart-dash-drawdown', trades, startingBalance);
  }
  function renderAnalyticsCharts(trades, settings) {
    initDefaults();
    renderEquity('chart-equity', trades, settings.startingBalance);
    renderDrawdown('chart-drawdown', trades, settings.startingBalance);
    renderPeriodPnl('chart-daily-pnl', trades, function (t) { return t.date; });
    renderPeriodPnl('chart-weekly-pnl', trades, function (t) { return Calc.getISOWeekKey(t.date); });
    renderPeriodPnl('chart-monthly-pnl', trades, function (t) { return Calc.getMonthKey(t.date); });
    renderWinLoss('chart-winloss', trades);
    renderRDistribution('chart-rdist', trades);
    renderSessionPerformance('chart-session-perf', trades);
    renderSetupPerformance('chart-setup-perf', trades);
    renderLongShort('chart-long-short', trades);
    renderTimeOfDay('chart-tod', trades);
  }

  global.Charts = {
    initDefaults: initDefaults,
    renderDashboardCharts: renderDashboardCharts,
    renderAnalyticsCharts: renderAnalyticsCharts
  };
})(window);
