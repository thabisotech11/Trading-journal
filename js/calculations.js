/* ==========================================================================
   calculations.js — pure functions only. No DOM, no localStorage. Every
   function takes plain data in and returns plain data out, so it can be
   unit-tested and reused if a backend ever replaces storage.js.
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG;

  function isNum(v) { return typeof v === 'number' && !isNaN(v) && isFinite(v); }

  // ---- Dates --------------------------------------------------------------
  function calcTradingDay(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return '';
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return '';
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getDay()];
  }
  function getMonthKey(dateStr) { return dateStr ? dateStr.slice(0, 7) : ''; }
  function getISOWeekKey(dateStr) {
    if (!dateStr) return '';
    var p = dateStr.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var dayNum = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this ISO week
    var firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    var fThDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fThDayNum + 3);
    var weekNum = 1 + Math.round((d - firstThursday) / (7 * 86400000));
    return d.getUTCFullYear() + '-W' + (weekNum < 10 ? '0' : '') + weekNum;
  }
  function toMinutes(hhmm) {
    if (!hhmm || hhmm.indexOf(':') === -1) return null;
    var p = hhmm.split(':');
    var h = Number(p[0]), m = Number(p[1]);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }
  function isTimeInWindow(hhmm, start, end) {
    var t = toMinutes(hhmm), s = toMinutes(start), e = toMinutes(end);
    if (t === null || s === null || e === null) return null;
    if (s <= e) return t >= s && t <= e;
    return t >= s || t <= e; // window crosses midnight
  }
  function chronoKey(t) {
    return (t.date || '0000-00-00') + 'T' + (t.exitTime || t.entryTime || '00:00') + '_' + (t.createdAt || 0);
  }
  function sortChrono(trades) {
    return trades.slice().sort(function (a, b) {
      var ka = chronoKey(a), kb = chronoKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }

  // ---- Risk math ------------------------------------------------------------
  function calcStopDistance(entry, stop) {
    if (!isNum(entry) || !isNum(stop)) return null;
    return Math.abs(entry - stop);
  }
  function calcTargetDistance(entry, tp) {
    if (!isNum(entry) || !isNum(tp)) return null;
    return Math.abs(tp - entry);
  }
  function calcRR(entry, stop, tp) {
    var sd = calcStopDistance(entry, stop);
    var td = calcTargetDistance(entry, tp);
    if (sd === null || td === null || sd === 0) return null;
    return td / sd;
  }
  function calcRiskAmountFromPercent(balance, riskPercent) {
    if (!isNum(balance) || !isNum(riskPercent)) return null;
    return balance * riskPercent / 100;
  }
  function calcRiskPercentFromAmount(balance, riskAmount) {
    if (!isNum(balance) || balance === 0 || !isNum(riskAmount)) return null;
    return riskAmount / balance * 100;
  }
  function calcPotentialProfit(riskAmount, rr) {
    if (!isNum(riskAmount) || !isNum(rr)) return null;
    return riskAmount * rr;
  }
  function calcRMultiple(pnl, riskAmount) {
    if (!isNum(pnl) || !isNum(riskAmount) || riskAmount === 0) return null;
    return pnl / riskAmount;
  }
  function calcResult(pnl) {
    if (!isNum(pnl)) return null;
    if (pnl > 0) return 'win';
    if (pnl < 0) return 'loss';
    return 'breakeven';
  }
  function suggestPnl(direction, entryPrice, exitPrice, positionSize, pointValue, commission) {
    if (!isNum(entryPrice) || !isNum(exitPrice) || !isNum(positionSize) || !isNum(pointValue)) return null;
    var move = direction === 'sell' ? (entryPrice - exitPrice) : (exitPrice - entryPrice);
    var gross = move * positionSize * pointValue;
    return gross - (isNum(commission) ? commission : 0);
  }

  // ---- Portfolio-level metrics ----------------------------------------------
  function closedWithPnl(trades) {
    return trades.filter(function (t) { return t.status === 'closed' && isNum(t.pnl); });
  }
  function calcCurrentBalance(trades, startingBalance) {
    var net = closedWithPnl(trades).reduce(function (s, t) { return s + t.pnl; }, 0);
    return (isNum(startingBalance) ? startingBalance : 0) + net;
  }
  function calcWinRate(trades) {
    var closed = closedWithPnl(trades);
    if (!closed.length) return null;
    var wins = closed.filter(function (t) { return t.result === 'win'; }).length;
    return wins / closed.length * 100;
  }
  function calcProfitFactor(trades) {
    var closed = closedWithPnl(trades);
    var grossProfit = closed.filter(function (t) { return t.pnl > 0; }).reduce(function (s, t) { return s + t.pnl; }, 0);
    var grossLoss = Math.abs(closed.filter(function (t) { return t.pnl < 0; }).reduce(function (s, t) { return s + t.pnl; }, 0));
    if (grossLoss > 0) return grossProfit / grossLoss;
    return grossProfit > 0 ? Infinity : null;
  }
  function calcAverageR(trades) {
    var closed = trades.filter(function (t) { return t.status === 'closed' && isNum(t.rMultiple); });
    if (!closed.length) return null;
    return closed.reduce(function (s, t) { return s + t.rMultiple; }, 0) / closed.length;
  }
  function calcExpectancy(trades) {
    // Returns both R-based (position-size independent) and dollar-based expectancy.
    var closed = closedWithPnl(trades);
    if (!closed.length) return { r: null, dollar: null };
    var wins = closed.filter(function (t) { return t.result === 'win'; });
    var losses = closed.filter(function (t) { return t.result === 'loss'; });
    var winRateFrac = wins.length / closed.length;
    var lossRateFrac = losses.length / closed.length;
    var avgWinDollar = wins.length ? wins.reduce(function (s, t) { return s + t.pnl; }, 0) / wins.length : 0;
    var avgLossDollar = losses.length ? Math.abs(losses.reduce(function (s, t) { return s + t.pnl; }, 0) / losses.length) : 0;
    var rWins = wins.filter(function (t) { return isNum(t.rMultiple); });
    var rLosses = losses.filter(function (t) { return isNum(t.rMultiple); });
    var avgWinR = rWins.length ? rWins.reduce(function (s, t) { return s + t.rMultiple; }, 0) / rWins.length : 0;
    var avgLossR = rLosses.length ? Math.abs(rLosses.reduce(function (s, t) { return s + t.rMultiple; }, 0) / rLosses.length) : 0;
    return {
      r: (winRateFrac * avgWinR) - (lossRateFrac * avgLossR),
      dollar: (winRateFrac * avgWinDollar) - (lossRateFrac * avgLossDollar),
      avgWinDollar: avgWinDollar, avgLossDollar: avgLossDollar, avgWinR: avgWinR, avgLossR: avgLossR
    };
  }
  function buildEquityCurve(trades, startingBalance) {
    var closed = sortChrono(closedWithPnl(trades));
    var equity = isNum(startingBalance) ? startingBalance : 0;
    var peak = equity;
    var points = [{ date: null, tradeId: null, equity: equity, drawdown: 0, drawdownPct: 0 }];
    closed.forEach(function (t) {
      equity += t.pnl;
      if (equity > peak) peak = equity;
      var dd = peak - equity;
      var ddPct = peak !== 0 ? (dd / peak * 100) : 0;
      points.push({ date: t.date, tradeId: t.id, equity: equity, drawdown: dd, drawdownPct: ddPct });
    });
    return points;
  }
  function calcMaxDrawdown(trades, startingBalance) {
    var pts = buildEquityCurve(trades, startingBalance);
    var maxDd = 0, maxDdPct = 0;
    pts.forEach(function (p) {
      if (p.drawdown > maxDd) maxDd = p.drawdown;
      if (p.drawdownPct > maxDdPct) maxDdPct = p.drawdownPct;
    });
    return { amount: maxDd, percent: maxDdPct };
  }
  function calcStreaks(trades) {
    var closed = sortChrono(trades.filter(function (t) { return t.status === 'closed' && t.result; }));
    var maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
    closed.forEach(function (t) {
      if (t.result === 'win') { curWin++; curLoss = 0; }
      else if (t.result === 'loss') { curLoss++; curWin = 0; }
      else { curWin = 0; curLoss = 0; }
      if (curWin > maxWin) maxWin = curWin;
      if (curLoss > maxLoss) maxLoss = curLoss;
    });
    return { maxConsecutiveWins: maxWin, maxConsecutiveLosses: maxLoss };
  }
  function calcHoldingMinutes(trade) {
    if (!trade.entryTime || !trade.exitTime) return null;
    var e = toMinutes(trade.entryTime), x = toMinutes(trade.exitTime);
    if (e === null || x === null) return null;
    var diff = x - e;
    if (diff < 0) diff += 24 * 60;
    return diff;
  }
  function calcAvgHoldingMinutes(trades) {
    var vals = trades.map(calcHoldingMinutes).filter(function (v) { return v !== null; });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function calcLargestWinLoss(trades) {
    var closed = closedWithPnl(trades);
    var wins = closed.filter(function (t) { return t.pnl > 0; }).map(function (t) { return t.pnl; });
    var losses = closed.filter(function (t) { return t.pnl < 0; }).map(function (t) { return t.pnl; });
    return {
      largestWin: wins.length ? Math.max.apply(null, wins) : null,
      largestLoss: losses.length ? Math.min.apply(null, losses) : null
    };
  }

  // ---- Scores ---------------------------------------------------------------
  function calcConfluenceScore(smc) {
    var checked = 0, total = 0;
    Object.keys(CFG.SMC_CHECKLIST).forEach(function (group) {
      CFG.SMC_CHECKLIST[group].items.forEach(function (item) {
        total++;
        if (smc && smc[group] && smc[group][item.key]) checked++;
      });
    });
    if (!total) return 0;
    return Math.round((checked / total) * 100); // 0-100%: several checklist items are mutually
    // exclusive alternatives (Premium vs Discount, HH vs LL), so no real trade approaches 100% —
    // a percentage of signals-confirmed reads honestly, where a /10 scale would look like a failing grade.
  }
  function calcDisciplineScore(after) {
    if (!after) return null;
    var good = 0;
    for (var i = 0; i < CFG.PSYCHOLOGY_AFTER.length; i++) {
      var f = CFG.PSYCHOLOGY_AFTER[i];
      var v = after[f.key];
      if (v === null || v === undefined) return null; // incomplete -> pending, not a misleading partial score
      if (v === f.good) good++;
    }
    return Math.round((good / CFG.PSYCHOLOGY_AFTER.length) * 100) / 10;
  }
  function calcTradeQualityScore(quality) {
    if (!quality) return null;
    var sum = 0;
    for (var i = 0; i < CFG.QUALITY_CATEGORIES.length; i++) {
      var v = quality[CFG.QUALITY_CATEGORIES[i].key];
      if (typeof v !== 'number') return null; // require every category rated
      sum += v;
    }
    return Math.round((sum / (CFG.QUALITY_CATEGORIES.length * 10)) * 100);
  }

  // ---- Rule compliance --------------------------------------------------------
  function evaluateRule(trade, rule) {
    switch (rule.type) {
      case 'marketOnly':
        return trade.market ? trade.market === (rule.param || 'US30') : null;
      case 'sessionOnly': {
        var allowed = rule.param || [];
        if (!trade.session) return null;
        return allowed.indexOf(trade.session) !== -1;
      }
      case 'maxRisk':
        if (!isNum(trade.riskPercent)) return null;
        return trade.riskPercent <= rule.maxValue;
      case 'minRR': {
        var rr = calcRR(trade.entryPrice, trade.stopLoss, trade.takeProfit);
        if (rr === null) return null;
        return rr >= rule.minValue;
      }
      case 'requireSweep':
        return !!(trade.smc && trade.smc.liquidity && trade.smc.liquidity.sweep);
      case 'requireConfirmation': {
        var m = trade.mtf || {};
        var has15 = m.m15 && m.m15.confirmation && String(m.m15.confirmation).trim().length > 0;
        var has5 = m.m5 && m.m5.confirmation && String(m.m5.confirmation).trim().length > 0;
        return !!(has15 || has5);
      }
      case 'noChasePrice':
        if (!trade.psychology || !trade.psychology.after) return null;
        if (trade.psychology.after.chasedPrice === null || trade.psychology.after.chasedPrice === undefined) return null;
        return trade.psychology.after.chasedPrice === false;
      case 'noMovedStop':
        if (!trade.psychology || !trade.psychology.after) return null;
        if (trade.psychology.after.movedStop === null || trade.psychology.after.movedStop === undefined) return null;
        return trade.psychology.after.movedStop === false;
      case 'noRevengeTrade':
        if (!trade.psychology || !trade.psychology.after) return null;
        if (trade.psychology.after.revengeTraded === null || trade.psychology.after.revengeTraded === undefined) return null;
        return trade.psychology.after.revengeTraded === false;
      default:
        return null; // 'custom' and anything unrecognized needs a manual mark
    }
  }
  function calcRuleCompliance(trade, rules, settings) {
    var manualMap = {};
    ((trade.ruleCompliance && trade.ruleCompliance.results) || []).forEach(function (r) {
      if (r.manual) manualMap[r.ruleId] = r.followed;
    });
    var enriched = rules.filter(function (r) { return r.active; }).map(function (rule) {
      var withDefaults = Object.assign({
        maxValue: settings ? settings.maxRiskPercent : 1,
        minValue: settings ? settings.minRR : 2
      }, rule);
      var auto = evaluateRule(trade, withDefaults);
      var manual = auto === null;
      var followed = manual ? (manualMap.hasOwnProperty(rule.id) ? manualMap[rule.id] : null) : auto;
      return { ruleId: rule.id, text: rule.text, followed: followed, manual: manual };
    });
    var compliant = enriched.filter(function (r) { return r.followed === true; }).length;
    var broken = enriched.filter(function (r) { return r.followed === false; }).length;
    var pending = enriched.filter(function (r) { return r.followed === null; }).length;
    return { results: enriched, compliant: compliant, broken: broken, pending: pending, total: enriched.length };
  }

  // ---- Generic grouping / aggregation (used by session & strategy intel) ----
  function groupBy(trades, keyFn) {
    var out = {};
    trades.forEach(function (t) {
      var k = keyFn(t);
      if (k === null || k === undefined || k === '') return;
      (out[k] = out[k] || []).push(t);
    });
    return out;
  }
  function aggregateStats(trades) {
    var closed = closedWithPnl(trades);
    var wins = closed.filter(function (t) { return t.result === 'win'; });
    var losses = closed.filter(function (t) { return t.result === 'loss'; });
    var grossProfit = wins.reduce(function (s, t) { return s + t.pnl; }, 0);
    var grossLoss = Math.abs(losses.reduce(function (s, t) { return s + t.pnl; }, 0));
    var netPnl = closed.reduce(function (s, t) { return s + t.pnl; }, 0);
    var exp = calcExpectancy(trades);
    return {
      count: trades.length,
      closedCount: closed.length,
      wins: wins.length,
      losses: losses.length,
      breakevens: closed.length - wins.length - losses.length,
      winRate: closed.length ? wins.length / closed.length * 100 : null,
      netPnl: netPnl,
      grossProfit: grossProfit,
      grossLoss: grossLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null),
      avgR: calcAverageR(trades),
      expectancyR: exp.r,
      avgTrade: closed.length ? netPnl / closed.length : null
    };
  }
  function rankGroups(groupedObj, minSample, sortKey) {
    sortKey = sortKey || 'expectancyR';
    var rows = Object.keys(groupedObj).map(function (k) {
      return Object.assign({ key: k }, aggregateStats(groupedObj[k]));
    });
    var eligible = rows.filter(function (r) { return r.closedCount >= minSample; });
    eligible.sort(function (a, b) { return (b[sortKey] === null ? -999 : b[sortKey]) - (a[sortKey] === null ? -999 : a[sortKey]); });
    return {
      all: rows,
      eligible: eligible,
      best: eligible.length ? eligible[0] : null,
      worst: eligible.length ? eligible[eligible.length - 1] : null
    };
  }

  global.Calc = {
    isNum: isNum,
    calcTradingDay: calcTradingDay, getMonthKey: getMonthKey, getISOWeekKey: getISOWeekKey,
    toMinutes: toMinutes, isTimeInWindow: isTimeInWindow, sortChrono: sortChrono,
    calcStopDistance: calcStopDistance, calcTargetDistance: calcTargetDistance, calcRR: calcRR,
    calcRiskAmountFromPercent: calcRiskAmountFromPercent, calcRiskPercentFromAmount: calcRiskPercentFromAmount,
    calcPotentialProfit: calcPotentialProfit, calcRMultiple: calcRMultiple, calcResult: calcResult,
    suggestPnl: suggestPnl,
    closedWithPnl: closedWithPnl, calcCurrentBalance: calcCurrentBalance,
    calcWinRate: calcWinRate, calcProfitFactor: calcProfitFactor, calcAverageR: calcAverageR,
    calcExpectancy: calcExpectancy, buildEquityCurve: buildEquityCurve, calcMaxDrawdown: calcMaxDrawdown,
    calcStreaks: calcStreaks, calcHoldingMinutes: calcHoldingMinutes, calcAvgHoldingMinutes: calcAvgHoldingMinutes,
    calcLargestWinLoss: calcLargestWinLoss,
    calcConfluenceScore: calcConfluenceScore, calcDisciplineScore: calcDisciplineScore,
    calcTradeQualityScore: calcTradeQualityScore,
    evaluateRule: evaluateRule, calcRuleCompliance: calcRuleCompliance,
    groupBy: groupBy, aggregateStats: aggregateStats, rankGroups: rankGroups
  };
})(window);
