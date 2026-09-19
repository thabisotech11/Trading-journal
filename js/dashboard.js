/* ==========================================================================
   dashboard.js — Dashboard, Analytics, Session Intelligence and Strategy
   Intelligence. Grouped together because they're all read-only lenses over
   the same trade data, sharing the metrics-grid renderer and formatters.
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG, Calc = global.Calc, Storage = global.Storage, UI = global.UI, Insights = global.Insights;
  var qs = UI.qs, qsa = UI.qsa;

  function renderMetricsGrid(containerSel, metrics) {
    var container = qs(containerSel);
    if (!container) return;
    container.innerHTML = metrics.map(function (m) {
      return '<div class="metric-cell"><div class="metric-label">' + UI.escapeHtml(m.label) + '</div><div class="metric-value ' + (m.tone || '') + '">' + m.value + '</div></div>';
    }).join('');
  }
  function renderInsightList(container, insights, emptyText) {
    if (!insights.length) { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-brain"></i>' + emptyText + '</div>'; return; }
    container.innerHTML = insights.map(function (text) {
      return '<div class="insight-card"><i class="fa-solid fa-lightbulb"></i><span>' + UI.escapeHtml(text) + '</span></div>';
    }).join('');
  }

  // ---- Dashboard ----------------------------------------------------------
  function buildAccountMetrics(trades, settings) {
    var current = Calc.calcCurrentBalance(trades, settings.startingBalance);
    var totalPnl = current - settings.startingBalance;
    var today = UI.todayIso(), thisWeek = Calc.getISOWeekKey(today), thisMonth = Calc.getMonthKey(today);
    var closed = Calc.closedWithPnl(trades);
    var dailyPnl = closed.filter(function (t) { return t.date === today; }).reduce(function (s, t) { return s + t.pnl; }, 0);
    var weeklyPnl = closed.filter(function (t) { return Calc.getISOWeekKey(t.date) === thisWeek; }).reduce(function (s, t) { return s + t.pnl; }, 0);
    var monthlyPnl = closed.filter(function (t) { return Calc.getMonthKey(t.date) === thisMonth; }).reduce(function (s, t) { return s + t.pnl; }, 0);
    var wins = closed.filter(function (t) { return t.result === 'win'; });
    var losses = closed.filter(function (t) { return t.result === 'loss'; });
    var be = closed.length - wins.length - losses.length;
    var lossRate = closed.length ? losses.length / closed.length * 100 : null;
    var avgWin = wins.length ? wins.reduce(function (s, t) { return s + t.pnl; }, 0) / wins.length : null;
    var avgLoss = losses.length ? losses.reduce(function (s, t) { return s + t.pnl; }, 0) / losses.length : null;
    var rrVals = trades.map(function (t) { return Calc.calcRR(t.entryPrice, t.stopLoss, t.takeProfit); }).filter(function (v) { return v !== null; });
    var avgRR = rrVals.length ? rrVals.reduce(function (a, b) { return a + b; }, 0) / rrVals.length : null;
    var maxDd = Calc.calcMaxDrawdown(trades, settings.startingBalance);
    var lw = Calc.calcLargestWinLoss(trades);
    return [
      { label: 'Starting Balance', value: UI.formatCurrency(settings.startingBalance, settings.currency) },
      { label: 'Current Balance', value: UI.formatCurrency(current, settings.currency) },
      { label: 'Total P&L', value: UI.formatCurrency(totalPnl, settings.currency), tone: UI.toneClass(totalPnl) },
      { label: 'Daily P&L', value: UI.formatCurrency(dailyPnl, settings.currency), tone: UI.toneClass(dailyPnl) },
      { label: 'Weekly P&L', value: UI.formatCurrency(weeklyPnl, settings.currency), tone: UI.toneClass(weeklyPnl) },
      { label: 'Monthly P&L', value: UI.formatCurrency(monthlyPnl, settings.currency), tone: UI.toneClass(monthlyPnl) },
      { label: 'Win Rate', value: UI.formatPercent(Calc.calcWinRate(trades), 1) },
      { label: 'Loss Rate', value: UI.formatPercent(lossRate, 1) },
      { label: 'Profit Factor', value: UI.formatProfitFactor(Calc.calcProfitFactor(trades)) },
      { label: 'Average Win', value: avgWin != null ? UI.formatCurrency(avgWin, settings.currency) : '\u2014', tone: avgWin != null ? 'positive' : '' },
      { label: 'Average Loss', value: avgLoss != null ? UI.formatCurrency(avgLoss, settings.currency) : '\u2014', tone: avgLoss != null ? 'negative' : '' },
      { label: 'Risk/Reward Avg', value: avgRR != null ? avgRR.toFixed(2) + 'R' : '\u2014' },
      { label: 'Maximum Drawdown', value: UI.formatCurrency(maxDd.amount, settings.currency) + ' (' + maxDd.percent.toFixed(1) + '%)', tone: maxDd.amount > 0 ? 'negative' : '' },
      { label: 'Largest Win', value: lw.largestWin != null ? UI.formatCurrency(lw.largestWin, settings.currency) : '\u2014', tone: lw.largestWin != null ? 'positive' : '' },
      { label: 'Largest Loss', value: lw.largestLoss != null ? UI.formatCurrency(lw.largestLoss, settings.currency) : '\u2014', tone: lw.largestLoss != null ? 'negative' : '' },
      { label: 'Total Trades', value: closed.length },
      { label: 'Winning Trades', value: wins.length, tone: wins.length ? 'positive' : '' },
      { label: 'Losing Trades', value: losses.length, tone: losses.length ? 'negative' : '' },
      { label: 'Breakeven Trades', value: be }
    ];
  }
  function buildPerformanceCards(trades, settings) {
    var current = Calc.calcCurrentBalance(trades, settings.startingBalance);
    var curve = Calc.buildEquityCurve(trades, settings.startingBalance);
    var latestDdPct = curve.length ? curve[curve.length - 1].drawdownPct : 0;
    var exp = Calc.calcExpectancy(trades);
    return [
      { label: 'Equity', value: UI.formatCurrency(current, settings.currency) },
      { label: 'Drawdown', value: latestDdPct > 0.05 ? '-' + latestDdPct.toFixed(1) + '%' : '0.0%', tone: latestDdPct > 0.05 ? 'negative' : '' },
      { label: 'Win Rate', value: UI.formatPercent(Calc.calcWinRate(trades), 1) },
      { label: 'Profit Factor', value: UI.formatProfitFactor(Calc.calcProfitFactor(trades)) },
      { label: 'Average R', value: UI.formatR(Calc.calcAverageR(trades)) },
      { label: 'Expectancy', value: exp.dollar != null ? UI.formatCurrency(exp.dollar, settings.currency) + ' /trade' : '\u2014', tone: exp.dollar != null ? UI.toneClass(exp.dollar) : '' }
    ];
  }
  function renderDashboardBanners(trades, settings) {
    var today = UI.todayIso();
    var todayClosed = trades.filter(function (t) { return t.date === today && t.status === 'closed' && Calc.isNum(t.rMultiple); });
    var dayR = todayClosed.reduce(function (s, t) { return s + t.rMultiple; }, 0);
    var stopBanner = qs('#daily-stop-banner');
    if (dayR <= -settings.maxDailyLossR) {
      stopBanner.classList.remove('hidden');
      stopBanner.innerHTML = '<span><i class="fa-solid fa-hand"></i> DAILY STOP \u2014 NO MORE TRADES (today: ' + UI.formatR(dayR) + ')</span>';
    } else { stopBanner.classList.add('hidden'); }
    qs('#demo-data-banner').classList.toggle('hidden', !Storage.hasDemoData());
  }
  function renderDashboard() {
    var settings = Storage.getSettings();
    var trades = Storage.getTrades();
    renderDashboardBanners(trades, settings);
    qs('#performance-cards').innerHTML = buildPerformanceCards(trades, settings).map(function (c) {
      return '<div class="perf-card ' + (c.tone ? 'tone-' + c.tone : '') + '"><div class="perf-card-label">' + c.label + '</div><div class="perf-card-value ' + (c.tone || '') + '">' + c.value + '</div></div>';
    }).join('');
    renderMetricsGrid('#account-metrics-grid', buildAccountMetrics(trades, settings));
    global.Charts.renderDashboardCharts(trades, settings.startingBalance);
    var recent = Calc.sortChrono(trades).slice(-8).reverse();
    global.Journal.renderMiniList(qs('#recent-trades-list'), recent, { emptyText: 'No trades yet \u2014 log your first one.' });
    var insights = Insights.generateStrategyInsights(trades).slice(0, 3);
    renderInsightList(qs('#dash-insights-preview'), insights, 'Not enough closed trades yet for pattern detection.');
  }

  // ---- Analytics ------------------------------------------------------------
  function buildAdvancedMetrics(trades) {
    var streaks = Calc.calcStreaks(trades);
    var avgHold = Calc.calcAvgHoldingMinutes(trades.filter(function (t) { return t.status === 'closed'; }));
    var exp = Calc.calcExpectancy(trades);
    var sessionRank = Calc.rankGroups(Calc.groupBy(trades, function (t) { return t.session; }), 3);
    var setupRank = Calc.rankGroups(Calc.groupBy(trades, function (t) { return t.setup; }), 3);
    var dowRank = Calc.rankGroups(Calc.groupBy(trades, function (t) { return t.tradingDay; }), 3);
    var maxDd = Calc.calcMaxDrawdown(trades, Storage.getSettings().startingBalance);
    return [
      { label: 'Win Rate', value: UI.formatPercent(Calc.calcWinRate(trades), 1) },
      { label: 'Profit Factor', value: UI.formatProfitFactor(Calc.calcProfitFactor(trades)) },
      { label: 'Expectancy ($/trade)', value: exp.dollar != null ? UI.formatCurrency(exp.dollar) : '\u2014', tone: exp.dollar != null ? UI.toneClass(exp.dollar) : '' },
      { label: 'Average R', value: UI.formatR(Calc.calcAverageR(trades)) },
      { label: 'Avg Win (R)', value: exp.avgWinR ? '+' + exp.avgWinR.toFixed(2) + 'R' : '\u2014' },
      { label: 'Avg Loss (R)', value: exp.avgLossR ? '-' + exp.avgLossR.toFixed(2) + 'R' : '\u2014' },
      { label: 'Max Drawdown', value: maxDd.percent.toFixed(1) + '%', tone: maxDd.amount > 0 ? 'negative' : '' },
      { label: 'Max Consecutive Wins', value: streaks.maxConsecutiveWins },
      { label: 'Max Consecutive Losses', value: streaks.maxConsecutiveLosses },
      { label: 'Avg Holding Time', value: UI.formatMinutes(avgHold) },
      { label: 'Best Session', value: sessionRank.best ? global.Journal.sessionLabel(sessionRank.best.key) : '\u2014' },
      { label: 'Worst Session', value: sessionRank.worst ? global.Journal.sessionLabel(sessionRank.worst.key) : '\u2014' },
      { label: 'Best Setup', value: setupRank.best ? global.Journal.setupLabel(setupRank.best.key) : '\u2014' },
      { label: 'Worst Setup', value: setupRank.worst ? global.Journal.setupLabel(setupRank.worst.key) : '\u2014' },
      { label: 'Best Day of Week', value: dowRank.best ? dowRank.best.key : '\u2014' },
      { label: 'Worst Day of Week', value: dowRank.worst ? dowRank.worst.key : '\u2014' }
    ];
  }
  function renderAnalytics() {
    var trades = Storage.getTrades();
    var settings = Storage.getSettings();
    renderMetricsGrid('#advanced-metrics-grid', buildAdvancedMetrics(trades));
    global.Charts.renderAnalyticsCharts(trades, settings);
  }

  // ---- Session Intelligence --------------------------------------------------
  function renderSessionIntel() {
    var trades = Storage.getTrades();
    var settings = Storage.getSettings();
    var si = Insights.sessionIntelligence(trades, 3);
    var banner = qs('#session-highlight-banner');
    if (si.highestExpectancySession) {
      banner.classList.remove('hidden');
      banner.innerHTML = '<span><i class="fa-solid fa-trophy"></i> Highest-expectancy session so far: <strong>' + global.Journal.sessionLabel(si.highestExpectancySession) + '</strong></span>';
    } else { banner.classList.add('hidden'); }
    qs('#session-intel-tbody').innerHTML = si.rows.map(function (r) {
      if (!r.closedCount) return '<tr><td>' + r.label + '</td><td colspan="8" class="hint">Not Enough Data</td></tr>';
      return '<tr>' +
        '<td>' + r.label + (si.highestExpectancySession === r.sessionKey ? ' <i class="fa-solid fa-trophy" style="color:var(--gold-bright)"></i>' : '') + '</td>' +
        '<td class="mono">' + r.closedCount + '</td>' +
        '<td class="mono">' + UI.formatPercent(r.winRate, 0) + '</td>' +
        '<td class="mono ' + UI.toneClass(r.netPnl) + '">' + UI.formatCurrency(r.netPnl, settings.currency) + '</td>' +
        '<td class="mono">' + UI.formatR(r.avgR) + '</td>' +
        '<td class="mono">' + UI.formatProfitFactor(r.profitFactor) + '</td>' +
        '<td class="mono">' + (r.avgTrade != null ? UI.formatCurrency(r.avgTrade, settings.currency) : '\u2014') + '</td>' +
        '<td>' + (r.bestSetup || '\u2014') + '</td>' +
        '<td>' + (r.worstSetup || '\u2014') + '</td>' +
        '</tr>';
    }).join('');
  }

  // ---- Strategy Intelligence --------------------------------------------------
  function renderStrategyIntel() {
    var trades = Storage.getTrades();
    var insights = Insights.generateStrategyInsights(trades);
    var list = qs('#strategy-insights-list');
    var empty = qs('#strategy-insights-empty');
    if (!insights.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      empty.innerHTML = '<i class="fa-solid fa-magnifying-glass-chart"></i>Not Enough Data \u2014 log more closed trades (at least ' + Insights.MIN_SAMPLE + ' per category) to unlock pattern detection.';
    } else {
      empty.classList.add('hidden');
      list.innerHTML = insights.map(function (text) {
        return '<div class="insight-card"><i class="fa-solid fa-lightbulb"></i><span>' + UI.escapeHtml(text) + '</span></div>';
      }).join('');
    }
  }

  function init() {
    qs('#btn-clear-demo-dash').addEventListener('click', function () {
      UI.showConfirm('Clear demo data?', "This removes all labeled demo trades and keeps any real trades you've logged.", function () {
        Storage.clearDemoData();
        if (global.App && global.App.refreshAll) global.App.refreshAll();
        UI.toast('Demo data cleared.', 'info');
      }, 'Clear');
    });
    UI.registerPageRefresh('dashboard', renderDashboard);
    UI.registerPageRefresh('analytics', renderAnalytics);
    UI.registerPageRefresh('sessionintel', renderSessionIntel);
    UI.registerPageRefresh('strategyintel', renderStrategyIntel);
  }

  global.Dashboard = {
    init: init, renderDashboard: renderDashboard, renderAnalytics: renderAnalytics,
    renderSessionIntel: renderSessionIntel, renderStrategyIntel: renderStrategyIntel,
    buildAccountMetrics: buildAccountMetrics, renderMetricsGrid: renderMetricsGrid
  };
})(window);
