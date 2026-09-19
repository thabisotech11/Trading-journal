/* ==========================================================================
   reviews.js — Daily / Weekly / Monthly Review pages. Each mixes stats
   derived purely from trade data with a handful of free-text reflection
   fields the trader fills in, persisted per period key (date / ISO week /
   calendar month) via Storage.saveReview.
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG, Calc = global.Calc, Storage = global.Storage, UI = global.UI;
  var qs = UI.qs;

  function insightCards(container, items, emptyText) {
    if (!items.length) { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-brain"></i>' + emptyText + '</div>'; return; }
    container.innerHTML = items.map(function (t) { return '<div class="insight-card"><i class="fa-solid fa-lightbulb"></i><span>' + UI.escapeHtml(t) + '</span></div>'; }).join('');
  }

  // ---- Daily Review -----------------------------------------------------------
  function dayBalances(dateStr, settings) {
    var trades = Storage.getTrades();
    var before = trades.filter(function (t) { return t.status === 'closed' && t.date < dateStr; });
    var onDay = trades.filter(function (t) { return t.status === 'closed' && t.date === dateStr; });
    return { opening: Calc.calcCurrentBalance(before, settings.startingBalance), closing: Calc.calcCurrentBalance(before.concat(onDay), settings.startingBalance) };
  }
  function renderDailyReview() {
    var picker = qs('#dr-date-picker');
    if (!picker.value) picker.value = UI.todayIso();
    var dateStr = picker.value;
    var settings = Storage.getSettings();
    var trades = Calc.sortChrono(Storage.getTrades().filter(function (t) { return t.date === dateStr && t.status === 'closed'; }));
    var bal = dayBalances(dateStr, settings);
    var dayR = trades.reduce(function (s, t) { return s + (typeof t.rMultiple === 'number' ? t.rMultiple : 0); }, 0);
    var dayPnl = trades.reduce(function (s, t) { return s + (t.pnl || 0); }, 0);
    var discVals = trades.map(function (t) { return t.psychology && t.psychology.disciplineScore; }).filter(function (v) { return v != null; });
    var avgDisc = discVals.length ? discVals.reduce(function (a, b) { return a + b; }, 0) / discVals.length : null;

    var stopBanner = qs('#dr-stop-banner');
    if (dayR <= -settings.maxDailyLossR) { stopBanner.classList.remove('hidden'); stopBanner.innerHTML = '<span><i class="fa-solid fa-hand"></i> DAILY STOP \u2014 NO MORE TRADES</span>'; }
    else stopBanner.classList.add('hidden');

    global.Dashboard.renderMetricsGrid('#daily-review-stats', [
      { label: 'Opening Balance', value: UI.formatCurrency(bal.opening, settings.currency) },
      { label: 'Closing Balance', value: UI.formatCurrency(bal.closing, settings.currency) },
      { label: 'Daily P&L', value: UI.formatCurrency(dayPnl, settings.currency), tone: UI.toneClass(dayPnl) },
      { label: 'Daily R', value: UI.formatR(dayR), tone: UI.toneClass(dayR) },
      { label: 'Trades Taken', value: trades.length },
      { label: 'Discipline (avg)', value: avgDisc != null ? avgDisc.toFixed(1) + '/10' : '\u2014' }
    ]);
    global.Journal.renderMiniList(qs('#dr-trades-list'), trades, { emptyText: 'No trades logged on this day.' });

    var tradeOptions = [{ value: '', label: '\u2014' }].concat(trades.map(function (t) {
      return { value: t.id, label: (t.pnl >= 0 ? '+' : '') + UI.formatCurrency(t.pnl, settings.currency) + ' \u00B7 ' + global.Journal.setupLabel(t.setup) };
    }));
    UI.fillSelect('#dr-bestTrade', tradeOptions);
    UI.fillSelect('#dr-worstTrade', tradeOptions);

    var saved = Storage.getReviews('dailyReviews')[dateStr] || {};
    qs('#dr-bestTrade').value = saved.bestTrade || '';
    qs('#dr-worstTrade').value = saved.worstTrade || '';
    qs('#dr-biggestMistake').value = saved.biggestMistake || '';
    qs('#dr-bestDecision').value = saved.bestDecision || '';
    qs('#dr-emotionalState').value = saved.emotionalState || '';
    qs('#dr-lessons').value = saved.lessons || '';
    qs('#dr-tomorrowFocus').value = saved.tomorrowFocus || '';
  }
  function wireDailyReview() {
    qs('#dr-date-picker').addEventListener('change', renderDailyReview);
    qs('#daily-review-form').addEventListener('submit', function (e) {
      e.preventDefault();
      Storage.saveReview('dailyReviews', qs('#dr-date-picker').value, {
        bestTrade: qs('#dr-bestTrade').value, worstTrade: qs('#dr-worstTrade').value,
        biggestMistake: qs('#dr-biggestMistake').value, bestDecision: qs('#dr-bestDecision').value,
        emotionalState: qs('#dr-emotionalState').value, lessons: qs('#dr-lessons').value,
        tomorrowFocus: qs('#dr-tomorrowFocus').value
      });
      UI.toast('Daily review saved.', 'success');
    });
  }

  // ---- Weekly Review -----------------------------------------------------------
  function weekTrades(weekKey) { return Storage.getTrades().filter(function (t) { return t.status === 'closed' && Calc.getISOWeekKey(t.date) === weekKey; }); }
  function renderWeeklyReview() {
    var picker = qs('#wr-week-picker');
    if (!picker.value) picker.value = Calc.getISOWeekKey(UI.todayIso());
    var weekKey = picker.value;
    var settings = Storage.getSettings();
    var trades = weekTrades(weekKey);
    var stats = Calc.aggregateStats(trades);
    var setupRank = Calc.rankGroups(Calc.groupBy(trades, function (t) { return t.setup; }), 2);
    var sessionRank = Calc.rankGroups(Calc.groupBy(trades, function (t) { return t.session; }), 2);

    var totalChecks = 0, totalBroken = 0, discVals = [];
    var rules = Storage.getRules();
    trades.forEach(function (t) {
      var rc = Calc.calcRuleCompliance(t, rules, settings);
      totalChecks += rc.total; totalBroken += rc.broken;
      if (t.psychology && t.psychology.disciplineScore != null) discVals.push(t.psychology.disciplineScore);
    });
    var avgDisc = discVals.length ? discVals.reduce(function (a, b) { return a + b; }, 0) / discVals.length : null;

    var badFlags = CFG.PSYCHOLOGY_AFTER.filter(function (f) { return f.good === false; });
    var flagCounts = {}; badFlags.forEach(function (f) { flagCounts[f.key] = 0; });
    trades.forEach(function (t) { badFlags.forEach(function (f) { if (t.psychology && t.psychology.after && t.psychology.after[f.key] === true) flagCounts[f.key]++; }); });
    var topFlag = null, topCount = 0;
    badFlags.forEach(function (f) { if (flagCounts[f.key] > topCount) { topCount = flagCounts[f.key]; topFlag = f; } });

    global.Dashboard.renderMetricsGrid('#weekly-review-stats', [
      { label: 'Total Trades', value: stats.closedCount },
      { label: 'Wins', value: stats.wins, tone: stats.wins ? 'positive' : '' },
      { label: 'Losses', value: stats.losses, tone: stats.losses ? 'negative' : '' },
      { label: 'Win Rate', value: UI.formatPercent(stats.winRate, 1) },
      { label: 'Net P&L', value: UI.formatCurrency(stats.netPnl, settings.currency), tone: UI.toneClass(stats.netPnl) },
      { label: 'Average R', value: UI.formatR(stats.avgR) },
      { label: 'Best Setup', value: setupRank.best ? global.Journal.setupLabel(setupRank.best.key) : '\u2014' },
      { label: 'Worst Setup', value: setupRank.worst ? global.Journal.setupLabel(setupRank.worst.key) : '\u2014' },
      { label: 'Best Session', value: sessionRank.best ? global.Journal.sessionLabel(sessionRank.best.key) : '\u2014' },
      { label: 'Worst Session', value: sessionRank.worst ? global.Journal.sessionLabel(sessionRank.worst.key) : '\u2014' },
      { label: 'Rule Violations', value: totalBroken + ' / ' + totalChecks },
      { label: 'Avg Discipline Score', value: avgDisc != null ? avgDisc.toFixed(1) + '/10' : '\u2014' }
    ]);

    var autoList = [];
    if (topFlag && topCount > 0) autoList.push('Biggest psychological issue this week: "' + topFlag.label + '" flagged on ' + topCount + ' of ' + trades.length + ' trades.');
    if (totalChecks > 0) autoList.push('Rule compliance this week: ' + (totalChecks - totalBroken) + '/' + totalChecks + ' checks followed.');
    insightCards(qs('#wr-auto-detected'), autoList, 'Not enough data this week yet.');

    var saved = Storage.getReviews('weeklyReviews')[weekKey] || {};
    qs('#wr-keyImprovement').value = saved.keyImprovement || '';
    qs('#wr-ruleViolationsNote').value = saved.ruleViolationsNote || '';
  }
  function wireWeeklyReview() {
    qs('#wr-week-picker').addEventListener('change', renderWeeklyReview);
    qs('#weekly-review-form').addEventListener('submit', function (e) {
      e.preventDefault();
      Storage.saveReview('weeklyReviews', qs('#wr-week-picker').value, {
        keyImprovement: qs('#wr-keyImprovement').value, ruleViolationsNote: qs('#wr-ruleViolationsNote').value
      });
      UI.toast('Weekly review saved.', 'success');
    });
  }

  // ---- Monthly Review -----------------------------------------------------------
  function monthTrades(monthKey) { return Storage.getTrades().filter(function (t) { return t.status === 'closed' && Calc.getMonthKey(t.date) === monthKey; }); }
  function renderMonthlyReview() {
    var picker = qs('#mr-month-picker');
    if (!picker.value) picker.value = Calc.getMonthKey(UI.todayIso());
    var monthKey = picker.value;
    var settings = Storage.getSettings();
    var trades = monthTrades(monthKey);
    var stats = Calc.aggregateStats(trades);
    var exp = Calc.calcExpectancy(trades);
    var setupRank = Calc.rankGroups(Calc.groupBy(trades, function (t) { return t.setup; }), 2);
    var sessionRank = Calc.rankGroups(Calc.groupBy(trades, function (t) { return t.session; }), 2);

    var allTrades = Storage.getTrades();
    var beforeMonth = allTrades.filter(function (t) { return t.status === 'closed' && Calc.getMonthKey(t.date) < monthKey; });
    var openingBalance = Calc.calcCurrentBalance(beforeMonth, settings.startingBalance);
    var closingBalance = Calc.calcCurrentBalance(beforeMonth.concat(trades), settings.startingBalance);
    var equityGrowthPct = openingBalance !== 0 ? (closingBalance - openingBalance) / Math.abs(openingBalance) * 100 : null;
    var monthDrawdown = Calc.calcMaxDrawdown(trades, openingBalance);

    var totalChecks = 0, totalCompliant = 0, discVals = [];
    var rules = Storage.getRules();
    trades.forEach(function (t) {
      var rc = Calc.calcRuleCompliance(t, rules, settings);
      totalChecks += rc.total; totalCompliant += rc.compliant;
      if (t.psychology && t.psychology.disciplineScore != null) discVals.push(t.psychology.disciplineScore);
    });
    var avgDisc = discVals.length ? discVals.reduce(function (a, b) { return a + b; }, 0) / discVals.length : null;
    var complianceRate = totalChecks ? totalCompliant / totalChecks : null;
    var consistencyScore = (avgDisc != null && complianceRate != null) ? Math.round((avgDisc / 10) * 50 + complianceRate * 50) : null;

    global.Dashboard.renderMetricsGrid('#monthly-review-stats', [
      { label: 'Monthly P&L', value: UI.formatCurrency(stats.netPnl, settings.currency), tone: UI.toneClass(stats.netPnl) },
      { label: 'Equity Growth %', value: equityGrowthPct != null ? equityGrowthPct.toFixed(1) + '%' : '\u2014', tone: equityGrowthPct != null ? UI.toneClass(equityGrowthPct) : '' },
      { label: 'Win Rate', value: UI.formatPercent(stats.winRate, 1) },
      { label: 'Profit Factor', value: UI.formatProfitFactor(stats.profitFactor) },
      { label: 'Expectancy', value: exp.dollar != null ? UI.formatCurrency(exp.dollar, settings.currency) : '\u2014' },
      { label: 'Maximum Drawdown', value: monthDrawdown.percent.toFixed(1) + '%' },
      { label: 'Best Setup', value: setupRank.best ? global.Journal.setupLabel(setupRank.best.key) : '\u2014' },
      { label: 'Worst Setup', value: setupRank.worst ? global.Journal.setupLabel(setupRank.worst.key) : '\u2014' },
      { label: 'Best Session', value: sessionRank.best ? global.Journal.sessionLabel(sessionRank.best.key) : '\u2014' },
      { label: 'Worst Session', value: sessionRank.worst ? global.Journal.sessionLabel(sessionRank.worst.key) : '\u2014' },
      { label: 'Average R', value: UI.formatR(stats.avgR) },
      { label: 'Rule Compliance', value: totalChecks ? Math.round(complianceRate * 100) + '%' : '\u2014' },
      { label: 'Psychology Score', value: avgDisc != null ? Math.round(avgDisc * 10) + '/100' : '\u2014' },
      { label: 'Consistency Score', value: consistencyScore != null ? consistencyScore + '/100' : '\u2014' }
    ]);

    var saved = Storage.getReviews('monthlyReviews')[monthKey] || {};
    qs('#mr-wins').value = saved.wins || '';
    qs('#mr-weaknesses').value = saved.weaknesses || '';
    qs('#mr-nextMonth').value = saved.nextMonth || '';
  }
  function wireMonthlyReview() {
    qs('#mr-month-picker').addEventListener('change', renderMonthlyReview);
    qs('#monthly-review-form').addEventListener('submit', function (e) {
      e.preventDefault();
      Storage.saveReview('monthlyReviews', qs('#mr-month-picker').value, {
        wins: qs('#mr-wins').value, weaknesses: qs('#mr-weaknesses').value, nextMonth: qs('#mr-nextMonth').value
      });
      UI.toast('Monthly review saved.', 'success');
    });
  }

  function init() {
    wireDailyReview(); wireWeeklyReview(); wireMonthlyReview();
    UI.registerPageRefresh('dailyreview', renderDailyReview);
    UI.registerPageRefresh('weeklyreview', renderWeeklyReview);
    UI.registerPageRefresh('monthlyreview', renderMonthlyReview);
  }

  global.Reviews = { init: init, renderDailyReview: renderDailyReview, renderWeeklyReview: renderWeeklyReview, renderMonthlyReview: renderMonthlyReview };
})(window);
