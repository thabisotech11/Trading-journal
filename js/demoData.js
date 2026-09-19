/* ==========================================================================
   demoData.js — generates clearly-labeled sample trades (isDemo: true) so the
   app never opens to an empty dashboard. Every number here is derived, not
   hard-coded: prices, R-multiples and P&L are all back-computed from the same
   risk math calculations.js uses for real trades, so the demo set is
   internally consistent and the "Clear demo data" action in Settings removes
   it cleanly (trade.isDemo is the only marker that matters).
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG;
  var Calc = global.Calc;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function isoDate(d) {
    var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  function fromMinutes(mins) {
    mins = ((Math.round(mins) % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60), m = mins % 60;
    return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  var NOTES_WIN = [
    'Clean read, sat on hands until confirmation.',
    'Textbook sweep and reclaim, sized normally.',
    'Patient entry, let the 5m close confirm first.',
    'Took the A+ setup, executed without hesitation.',
    'Followed the plan from the daily bias down.'
  ];
  var NOTES_LOSS = [
    'Entry was a touch early, stop got tagged.',
    'Should have waited for the retest, chased slightly.',
    'Session chopped, stop hit before expansion.',
    'Sized fine but the read was wrong on structure.',
    'Re-entered too quickly after the first stop-out.'
  ];
  var NOTES_BE = ['Managed to breakeven after initial push failed.', 'Scratched it when structure invalidated early.'];

  var LESSON_WIN = ['Trust the process when confluence stacks up.', 'Waiting for displacement paid off again.', 'Sizing discipline let the winner run.'];
  var LESSON_LOSS = ['Wait for the retest, do not chase the sweep.', 'Skip setups outside the NY window next time.', 'Stick to the checklist even when confident.'];

  function generate(seed) {
    var rand = mulberry32(seed || 20260101);
    function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
    function weightedPick(items) {
      var total = 0; for (var i = 0; i < items.length; i++) total += items[i].w;
      var r = rand() * total;
      for (var j = 0; j < items.length; j++) { r -= items[j].w; if (r <= 0) return items[j].v; }
      return items[items.length - 1].v;
    }
    function chance(p) { return rand() < p; }

    var settings = CFG.DEFAULT_SESSIONS;
    var maxRisk = CFG.DEFAULT_SETTINGS.maxRiskPercent;
    var minRR = CFG.DEFAULT_SETTINGS.minRR;
    var startingBalance = CFG.DEFAULT_SETTINGS.startingBalance;

    // Setup tiers control base win probability so "Strategy Intelligence" has
    // a real pattern to find: sweep/BOS setups outperform low-conviction ones.
    var SETUP_TIER = {
      liquidity_sweep: 0.62, bos_retest: 0.60, choch_reversal: 0.50,
      displacement_entry: 0.58, order_block_entry: 0.48, fvg_entry: 0.46,
      breaker_entry: 0.44, session_hl_sweep: 0.52, pdh_pdl_setup: 0.47,
      pwh_pwl_setup: 0.45, custom: 0.40
    };
    var SESSION_TIER = { ny_open: 0.58, ny_expansion: 0.56, ny_close: 0.47, london: 0.40, asian: 0.42 };
    var SESSION_WEIGHT = [{ v: 'ny_open', w: 40 }, { v: 'ny_expansion', w: 30 }, { v: 'london', w: 15 }, { v: 'ny_close', w: 10 }, { v: 'asian', w: 5 }];
    var GRADE_WEIGHT = [{ v: 'A+', w: 10 }, { v: 'A', w: 25 }, { v: 'B', w: 35 }, { v: 'C', w: 20 }, { v: 'D', w: 10 }];
    var GRADE_TIER = { 'A+': 0.18, A: 0.10, B: 0.0, C: -0.10, D: -0.20 };
    var DIRECTION_TIER = { buy: -0.03, sell: 0.05 }; // sells edge out buys slightly, by design, for the insight demo

    var today = new Date();
    var days = [];
    for (var i = 92; i >= 1; i--) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      days.push(d);
    }

    var trades = [];
    var balance = startingBalance;
    var basePrice = 45200 + rand() * 400;
    var counter = 0;

    days.forEach(function (d) {
      if (!chance(0.60)) return;
      basePrice += (rand() - 0.47) * 110;
      var dateStr = isoDate(d);
      var tradingDay = Calc.calcTradingDay(dateStr);
      var numTrades = weightedPick([{ v: 1, w: 55 }, { v: 2, w: 35 }, { v: 3, w: 10 }]);
      var dayR = 0;

      for (var n = 0; n < numTrades; n++) {
        if (dayR <= -CFG.DEFAULT_SETTINGS.maxDailyLossR) break;

        var session = weightedPick(SESSION_WEIGHT);
        var setup = pick(CFG.SETUP_TYPES.filter(function (s) { return s.key !== 'custom'; })).key;
        var grade = weightedPick(GRADE_WEIGHT);
        var direction = chance(0.5) ? 'buy' : 'sell';
        var confidence = clamp(Math.round(4 + rand() * 6 + (GRADE_TIER[grade] * 10)), 1, 10);

        var winProb = clamp(0.50 + (SETUP_TIER[setup] - 0.5) + (SESSION_TIER[session] - 0.5) + GRADE_TIER[grade] + DIRECTION_TIER[direction], 0.12, 0.88);
        var beRoll = chance(0.05);
        var isWin = !beRoll && chance(winProb);
        var result = beRoll ? 'breakeven' : (isWin ? 'win' : 'loss');

        var riskPercent = round2(chance(0.88) ? (0.4 + rand() * 0.6) : (1.1 + rand() * 0.5));
        var riskAmount = round2(balance * riskPercent / 100);
        var stopDistance = round1(40 + rand() * 90);
        var plannedRR = chance(0.82) ? round1(minRR + rand() * 2) : round1(1 + rand() * 0.9);

        var rMultiple;
        if (result === 'breakeven') rMultiple = 0;
        else if (result === 'win') rMultiple = round2(Math.max(0.3, plannedRR * (0.5 + rand() * 0.65)));
        else rMultiple = round2(-Math.min(1.15, 0.65 + rand() * 0.5));

        var pnl = round2(rMultiple * riskAmount);
        var entryPrice = round1(basePrice + (rand() - 0.5) * 60);
        var stopLoss = round1(direction === 'buy' ? entryPrice - stopDistance : entryPrice + stopDistance);
        var takeProfit = round1(direction === 'buy' ? entryPrice + stopDistance * plannedRR : entryPrice - stopDistance * plannedRR);
        var exitPrice = round1(direction === 'buy' ? entryPrice + rMultiple * stopDistance : entryPrice - rMultiple * stopDistance);

        var win = settings[session];
        var winStartMin = Calc.toMinutes(win.start), winEndMin = Calc.toMinutes(win.end);
        var span = (winEndMin - winStartMin + 1440) % 1440 || 60;
        var entryMin = winStartMin + Math.floor(rand() * span * 0.7);
        var holdMin = Math.round(8 + rand() * 65);
        var entryTime = fromMinutes(entryMin);
        var exitTime = fromMinutes(entryMin + holdMin);

        var highFomoBefore = (result === 'loss') && chance(0.55);
        var before = {};
        CFG.PSYCHOLOGY_BEFORE.forEach(function (f) {
          var base = f.good === 'high' ? 6 : 3;
          if (f.key === 'fomo' && highFomoBefore) base = 8;
          if (f.key === 'revengeTrading' && dayR < 0 && chance(0.4)) base = 7;
          before[f.key] = clamp(Math.round(base + (rand() - 0.5) * 4), 1, 10);
        });

        var badLeanProb = result === 'loss' ? 0.38 : 0.08;
        var after = {
          planned: chance(1 - badLeanProb * 0.6),
          followedRules: chance(1 - badLeanProb),
          enteredEarly: chance(badLeanProb * 0.7),
          chasedPrice: chance(badLeanProb * 0.6),
          movedStop: chance(badLeanProb * 0.35),
          movedTakeProfit: chance(badLeanProb * 0.25),
          overRisked: chance(riskPercent > maxRisk ? 0.8 : badLeanProb * 0.2),
          revengeTraded: chance((dayR < 0 && result === 'loss') ? badLeanProb * 0.5 : 0.03),
          exitedEmotionally: chance(badLeanProb * 0.4),
          followedSetupPerfectly: chance(1 - badLeanProb * 1.1)
        };

        var smc = { marketStructure: {}, liquidity: {}, priceDelivery: {} };
        CFG.SMC_CHECKLIST.marketStructure.items.forEach(function (it) { smc.marketStructure[it.key] = false; });
        CFG.SMC_CHECKLIST.liquidity.items.forEach(function (it) { smc.liquidity[it.key] = false; });
        CFG.SMC_CHECKLIST.priceDelivery.items.forEach(function (it) { smc.priceDelivery[it.key] = false; });
        smc.marketStructure[direction === 'buy' ? 'higherHigh' : 'lowerHigh'] = true;
        smc.marketStructure[direction === 'buy' ? 'higherLow' : 'lowerLow'] = true;
        smc.marketStructure.bos = chance(0.7);
        smc.marketStructure.choch = setup === 'choch_reversal' || chance(0.2);
        smc.marketStructure.mss = chance(0.4);
        smc.liquidity[direction === 'buy' ? 'buySide' : 'sellSide'] = true;
        smc.liquidity.sweep = setup === 'liquidity_sweep' || setup === 'session_hl_sweep' || chance(0.35);
        smc.liquidity.stopHunt = smc.liquidity.sweep && chance(0.5);
        smc.liquidity.prevSessionHigh = chance(0.3);
        smc.liquidity.prevSessionLow = chance(0.3);
        smc.priceDelivery.orderBlock = setup === 'order_block_entry' || chance(0.4);
        smc.priceDelivery.fvg = setup === 'fvg_entry' || chance(0.4);
        smc.priceDelivery.displacement = setup === 'displacement_entry' || (isWin && chance(0.55)) || chance(0.2);
        smc.priceDelivery.retest = setup === 'bos_retest' || chance(0.35);
        smc.priceDelivery[direction === 'buy' ? 'discount' : 'premium'] = chance(0.6);
        smc.priceDelivery.equilibrium = chance(0.2);

        var confluenceScore = Calc.calcConfluenceScore(smc);
        var disciplineScore = Calc.calcDisciplineScore(after);

        var mtf = {
          daily: { bias: direction === 'buy' ? 'Bullish' : 'Bearish', keyLevels: 'PDH ' + (entryPrice + 120).toFixed(1) + ' / PDL ' + (entryPrice - 120).toFixed(1), liquidity: 'Resting above PDH', majorStructure: 'Trending', notes: '' },
          h4: { bias: direction === 'buy' ? 'Bullish' : 'Bearish', structure: smc.marketStructure.bos ? 'BOS confirmed' : 'Ranging', liquidity: 'Session high/low untapped', keyZones: 'OB near ' + (entryPrice - (direction === 'buy' ? 40 : -40)).toFixed(1), notes: '' },
          h1: { bias: direction === 'buy' ? 'Bullish' : 'Bearish', marketStructure: 'Higher timeframe aligned', liquidity: 'Sweep pending', poi: 'Order block / FVG', notes: '' },
          m15: { structure: smc.marketStructure.choch ? 'CHOCH' : 'BOS', liquiditySweep: smc.liquidity.sweep ? 'Swept and reclaimed' : 'No sweep yet', confirmation: smc.priceDelivery.displacement ? 'Displacement candle' : 'Engulfing close', poi: 'FVG / OB', notes: '' },
          m5: { entryModel: CFG.SETUP_TYPES.filter(function (s) { return s.key === setup; })[0].label, confirmation: 'Structure shift on 5m', displacement: smc.priceDelivery.displacement ? 'Yes' : 'No', fvg: smc.priceDelivery.fvg ? 'Present' : 'None', orderBlock: smc.priceDelivery.orderBlock ? 'Present' : 'None', notes: '' },
          m1: { trigger: 'Micro BOS', entryConfirmation: 'Rejection wick', stopPlacement: 'Beyond swing point', executionNotes: '' }
        };

        var liquidityMap = {
          location: direction === 'buy' ? 'Resting above prior session high' : 'Resting below prior session low',
          targeted: session === 'ny_open' ? 'Asian session range' : 'Previous day extreme',
          swept: smc.liquidity.sweep,
          sweepQuality: smc.liquidity.sweep ? (isWin ? 'real' : (chance(0.5) ? 'real' : 'failed')) : '',
          postSweepDirection: direction === 'buy' ? 'Reversed higher' : 'Reversed lower',
          intendedTarget: 'Opposing liquidity pool',
          finalTargetReached: isWin ? 'Yes' : 'Partial',
          direction: direction === 'buy' ? 'buy_side' : 'sell_side',
          outcome: smc.liquidity.sweep ? (isWin ? 'swept_reversed' : 'failed_sweep') : 'no_sweep'
        };

        var trade = {
          id: 'demo_' + (counter++),
          status: 'closed',
          isDemo: true,
          date: dateStr, tradingDay: tradingDay,
          entryTime: entryTime, exitTime: exitTime,
          session: session, direction: direction, market: 'US30', timeframe: pick(CFG.TIMEFRAMES.slice(1, 5)),
          entryPrice: entryPrice, stopLoss: stopLoss, takeProfit: takeProfit, exitPrice: exitPrice,
          positionSize: round2(1 + rand() * 2), riskAmount: riskAmount, riskPercent: riskPercent,
          pnl: pnl, rMultiple: rMultiple, commission: round2(2 + rand() * 3), result: result,
          setup: setup, setupGrade: grade, confidence: confidence, confluenceScore: confluenceScore,
          smc: smc, liquidityMap: liquidityMap, mtf: mtf,
          psychology: { before: before, after: after, disciplineScore: disciplineScore },
          ruleCompliance: { results: [], compliant: null, total: null },
          preTradeChecklist: { emotionallyStable: !(result === 'loss' && chance(0.3)), followingPlan: !(result === 'loss' && chance(0.3)), completedAt: Date.now() },
          postTradeReview: buildPostTradeReview(result, grade, rand, pick, chance),
          screenshots: { htf: null, entrySetup: null, entryExecution: null, exit: null, postTrade: null },
          notes: result === 'win' ? pick(NOTES_WIN) : (result === 'loss' ? pick(NOTES_LOSS) : pick(NOTES_BE)),
          createdAt: new Date(dateStr + 'T' + exitTime + ':00').getTime(),
          updatedAt: new Date(dateStr + 'T' + exitTime + ':00').getTime()
        };
        var rc = Calc.calcRuleCompliance(trade, CFG.DEFAULT_RULES, CFG.DEFAULT_SETTINGS);
        trade.ruleCompliance = { results: rc.results, compliant: rc.compliant, total: rc.total };

        trades.push(trade);
        balance = round2(balance + pnl);
        if (typeof rMultiple === 'number') dayR += rMultiple;
      }
    });

    return trades;

    function buildPostTradeReview(result, grade, rand, pick, chance) {
      var good = result === 'win';
      var out = { completed: true, quality: {} };
      CFG.POST_TRADE_YESNO.forEach(function (f) { out[f.key] = good ? chance(0.85) : chance(0.4); });
      CFG.POST_TRADE_TEXT.forEach(function (f) { out[f.key] = ''; });
      out.whyEnter = 'Confluence lined up across HTF bias and the ' + (good ? 'A/B grade setup.' : 'setup, though conviction was lower.');
      out.didWell = good ? 'Waited for confirmation before pulling the trigger.' : 'Kept risk sized correctly despite the loss.';
      out.didWrong = good ? 'Could have trailed the stop tighter after MSS.' : 'Entered before full confirmation printed.';
      out.repeat = good ? 'Stalking the same liquidity pool pre-session.' : 'Journaling the setup before entry, not after.';
      out.stopDoing = good ? 'Second-guessing a clean A-grade signal.' : 'Entering on anticipation instead of confirmation.';
      out.lesson = good ? pick(LESSON_WIN) : pick(LESSON_LOSS);
      CFG.QUALITY_CATEGORIES.forEach(function (c) {
        var base = good ? 7 : 4;
        out.quality[c.key] = clamp(Math.round(base + (rand() - 0.5) * 4), 1, 10);
      });
      out.qualityScore = Calc.calcTradeQualityScore(out.quality);
      return out;
    }
  }

  global.DemoData = { generate: generate };
})(window);
