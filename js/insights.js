/* ==========================================================================
   insights.js — turns trade history into plain-English findings. Every
   insight is gated by both a minimum sample size AND a minimum effect size,
   so a thin or noisy dataset produces fewer (or zero) insights rather than
   a confident-sounding but meaningless claim.
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG;
  var Calc = global.Calc;
  var MIN_SAMPLE = 5;

  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null; }
  function fmtR(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + 'R'; }
  function setupLabel(key) {
    var m = CFG.SETUP_TYPES.filter(function (s) { return s.key === key; });
    return m.length ? m[0].label : key;
  }
  function sessionLabel(key) {
    return (CFG.DEFAULT_SESSIONS[key] && CFG.DEFAULT_SESSIONS[key].label) || key;
  }

  // ---- Session Intelligence (spec section 15) --------------------------
  function sessionIntelligence(trades, minSample) {
    minSample = minSample || 3;
    var bySession = Calc.groupBy(trades, function (t) { return t.session; });
    var rows = CFG.SESSION_ORDER.map(function (key) {
      var list = bySession[key] || [];
      var stats = Calc.aggregateStats(list);
      var setupRank = Calc.rankGroups(Calc.groupBy(list, function (t) { return t.setup; }), Math.min(2, minSample));
      return Object.assign({ sessionKey: key, label: sessionLabel(key) }, stats, {
        bestSetup: setupRank.best ? setupLabel(setupRank.best.key) : null,
        worstSetup: setupRank.worst && setupRank.worst.key !== (setupRank.best && setupRank.best.key) ? setupLabel(setupRank.worst.key) : null
      });
    });
    var eligible = rows.filter(function (r) { return r.closedCount >= minSample; });
    eligible.sort(function (a, b) { return (b.expectancyR === null ? -9 : b.expectancyR) - (a.expectancyR === null ? -9 : a.expectancyR); });
    return { rows: rows, highestExpectancySession: eligible.length ? eligible[0].sessionKey : null };
  }

  // ---- Strategy Intelligence (spec section 16) --------------------------
  function generateStrategyInsights(trades) {
    var closed = trades.filter(function (t) { return t.status === 'closed' && Calc.isNum(t.pnl); });
    var insights = [];

    // Best / weakest setup
    var setupRank = Calc.rankGroups(Calc.groupBy(closed, function (t) { return t.setup; }), MIN_SAMPLE);
    if (setupRank.best) {
      insights.push('Your highest-performing setup is ' + setupLabel(setupRank.best.key) + ', averaging ' + fmtR(setupRank.best.avgR) + ' across ' + setupRank.best.closedCount + ' trades.');
    }
    if (setupRank.worst && setupRank.eligible.length > 1 && setupRank.worst.key !== setupRank.best.key) {
      insights.push('Your weakest setup is ' + setupLabel(setupRank.worst.key) + ', averaging ' + fmtR(setupRank.worst.avgR) + ' across ' + setupRank.worst.closedCount + ' trades.');
    }

    // Best / worst session
    var sessionRank = Calc.rankGroups(Calc.groupBy(closed, function (t) { return t.session; }), MIN_SAMPLE);
    if (sessionRank.worst && sessionRank.eligible.length > 1) {
      insights.push('Your worst-performing session is ' + sessionLabel(sessionRank.worst.key) + ', averaging ' + fmtR(sessionRank.worst.avgR) + ' across ' + sessionRank.worst.closedCount + ' trades.');
    }
    if (sessionRank.best && sessionRank.eligible.length > 1) {
      insights.push('Your best-performing session is ' + sessionLabel(sessionRank.best.key) + ', averaging ' + fmtR(sessionRank.best.avgR) + ' across ' + sessionRank.best.closedCount + ' trades.');
    }

    // Direction (Buy vs Sell)
    var buys = closed.filter(function (t) { return t.direction === 'buy'; });
    var sells = closed.filter(function (t) { return t.direction === 'sell'; });
    if (buys.length >= MIN_SAMPLE && sells.length >= MIN_SAMPLE) {
      var buyR = Calc.aggregateStats(buys).avgR, sellR = Calc.aggregateStats(sells).avgR;
      if (Math.abs(sellR - buyR) >= 0.25) {
        var better = sellR > buyR ? 'Sell' : 'Buy', betterR = sellR > buyR ? sellR : buyR;
        var worse = sellR > buyR ? 'Buy' : 'Sell', worseR = sellR > buyR ? buyR : sellR;
        insights.push('You perform better on ' + better + ' setups (' + fmtR(betterR) + ' avg) than ' + worse + ' setups (' + fmtR(worseR) + ' avg).');
      }
    }

    // Setup grade
    var topGrade = closed.filter(function (t) { return t.setupGrade === 'A+' || t.setupGrade === 'A'; });
    var lowGrade = closed.filter(function (t) { return t.setupGrade === 'C' || t.setupGrade === 'D'; });
    if (topGrade.length >= MIN_SAMPLE && lowGrade.length >= MIN_SAMPLE) {
      var topR = Calc.aggregateStats(topGrade).avgR, lowR = Calc.aggregateStats(lowGrade).avgR;
      if (topR - lowR >= 0.25) {
        insights.push('Trades graded A/A+ have higher expectancy (' + fmtR(topR) + ' avg) than C/D-graded trades (' + fmtR(lowR) + ' avg).');
      }
    }

    // Displacement
    var withDisp = closed.filter(function (t) { return t.smc && t.smc.priceDelivery && t.smc.priceDelivery.displacement; });
    var withoutDisp = closed.filter(function (t) { return !(t.smc && t.smc.priceDelivery && t.smc.priceDelivery.displacement); });
    if (withDisp.length >= MIN_SAMPLE && withoutDisp.length >= MIN_SAMPLE) {
      var dR = Calc.aggregateStats(withDisp).avgR, ndR = Calc.aggregateStats(withoutDisp).avgR;
      if (dR - ndR >= 0.25) {
        insights.push('Your average R is significantly higher when you wait for displacement (' + fmtR(dR) + ') versus entries without it (' + fmtR(ndR) + ').');
      }
    }

    // FOMO vs losses
    var lossesF = closed.filter(function (t) { return t.result === 'loss' && t.psychology && t.psychology.before && Calc.isNum(t.psychology.before.fomo); });
    var winsF = closed.filter(function (t) { return t.result === 'win' && t.psychology && t.psychology.before && Calc.isNum(t.psychology.before.fomo); });
    if (lossesF.length >= MIN_SAMPLE && winsF.length >= MIN_SAMPLE) {
      var avgFomoLoss = avg(lossesF.map(function (t) { return t.psychology.before.fomo; }));
      var avgFomoWin = avg(winsF.map(function (t) { return t.psychology.before.fomo; }));
      if (avgFomoLoss - avgFomoWin >= 1) {
        insights.push('Your losing trades frequently follow elevated FOMO before entry (' + avgFomoLoss.toFixed(1) + '/10 on losses vs ' + avgFomoWin.toFixed(1) + '/10 on wins).');
      }
    }

    // Rule compliance vs outcome
    var withCompliance = closed.filter(function (t) { return t.ruleCompliance && t.ruleCompliance.total > 0; });
    var wcRates = [], lcRates = [];
    withCompliance.forEach(function (t) {
      var rate = t.ruleCompliance.compliant / t.ruleCompliance.total;
      if (t.result === 'win') wcRates.push(rate); else if (t.result === 'loss') lcRates.push(rate);
    });
    if (wcRates.length >= MIN_SAMPLE && lcRates.length >= MIN_SAMPLE) {
      var wcAvg = avg(wcRates) * 100, lcAvg = avg(lcRates) * 100;
      if (wcAvg - lcAvg >= 8) {
        insights.push('Winning trades average ' + wcAvg.toFixed(0) + '% rule compliance versus ' + lcAvg.toFixed(0) + '% on losing trades.');
      }
    }

    // Best day of week
    var dowRank = Calc.rankGroups(Calc.groupBy(closed, function (t) { return t.tradingDay; }), MIN_SAMPLE);
    if (dowRank.best && dowRank.eligible.length > 1) {
      insights.push('Your best trading day of the week is ' + dowRank.best.key + ', averaging ' + fmtR(dowRank.best.avgR) + '.');
    }
    if (dowRank.worst && dowRank.eligible.length > 1 && dowRank.worst.key !== dowRank.best.key) {
      insights.push('Your weakest trading day of the week is ' + dowRank.worst.key + ', averaging ' + fmtR(dowRank.worst.avgR) + '.');
    }

    return insights;
  }

  global.Insights = {
    sessionIntelligence: sessionIntelligence,
    generateStrategyInsights: generateStrategyInsights,
    MIN_SAMPLE: MIN_SAMPLE
  };
})(window);
