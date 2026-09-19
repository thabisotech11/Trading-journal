/* ==========================================================================
   storage.js — the only file that talks to localStorage directly.
   Pure persistence: no DOM, no calculations. Swap this module out later to
   point at a real backend without touching any other file.
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG;
  var P = CFG.STORAGE_PREFIX;

  var KEYS = {
    trades: P + 'trades',
    settings: P + 'settings',
    rules: P + 'rules',
    dailyReviews: P + 'dailyReviews',
    weeklyReviews: P + 'weeklyReviews',
    monthlyReviews: P + 'monthlyReviews',
    seeded: P + 'seeded'
  };

  function safeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error('[Storage] read failed for', key, e);
      return fallback;
    }
  }
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[Storage] write failed for', key, e);
      return false;
    }
  }

  function newId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // ---- Trades -------------------------------------------------------------
  function getTrades() { return safeGet(KEYS.trades, []); }
  function saveTrades(trades) { return safeSet(KEYS.trades, trades); }
  function getTrade(id) {
    var found = getTrades().filter(function (t) { return t.id === id; });
    return found.length ? found[0] : null;
  }
  function addTrade(trade) {
    var trades = getTrades();
    trade.id = trade.id || newId('trade');
    trade.createdAt = trade.createdAt || Date.now();
    trade.updatedAt = Date.now();
    trades.push(trade);
    saveTrades(trades);
    return trade;
  }
  function updateTrade(id, patch) {
    var trades = getTrades();
    var idx = -1;
    for (var i = 0; i < trades.length; i++) { if (trades[i].id === id) { idx = i; break; } }
    if (idx === -1) return null;
    var merged = Object.assign({}, trades[idx], patch, { id: id, updatedAt: Date.now() });
    trades[idx] = merged;
    saveTrades(trades);
    return merged;
  }
  function deleteTrade(id) {
    var trades = getTrades().filter(function (t) { return t.id !== id; });
    saveTrades(trades);
  }

  // ---- Settings -------------------------------------------------------------
  function getSettings() {
    var s = safeGet(KEYS.settings, null);
    if (!s) return JSON.parse(JSON.stringify(CFG.DEFAULT_SETTINGS));
    var merged = Object.assign({}, CFG.DEFAULT_SETTINGS, s);
    merged.sessions = Object.assign({}, CFG.DEFAULT_SESSIONS, s.sessions || {});
    return merged;
  }
  function saveSettings(settings) { return safeSet(KEYS.settings, settings); }

  // ---- Rules -------------------------------------------------------------
  function getRules() {
    var r = safeGet(KEYS.rules, null);
    if (!r) return JSON.parse(JSON.stringify(CFG.DEFAULT_RULES));
    return r;
  }
  function saveRules(rules) { return safeSet(KEYS.rules, rules); }

  // ---- Reviews (daily / weekly / monthly) -------------------------------
  function getReviews(kind) { return safeGet(KEYS[kind], {}); }
  function saveReview(kind, key, data) {
    var all = getReviews(kind);
    all[key] = Object.assign({}, all[key] || {}, data);
    safeSet(KEYS[kind], all);
    return all[key];
  }

  // ---- Empty-record factories ---------------------------------------------
  function emptySmc() {
    var out = {};
    Object.keys(CFG.SMC_CHECKLIST).forEach(function (group) {
      out[group] = {};
      CFG.SMC_CHECKLIST[group].items.forEach(function (item) { out[group][item.key] = false; });
    });
    return out;
  }
  function emptyMtf() {
    var out = {};
    CFG.MTF_CONFIG.forEach(function (tf) {
      out[tf.key] = {};
      tf.fields.forEach(function (f) { out[tf.key][f.key] = ''; });
    });
    return out;
  }
  function emptyBefore() {
    var out = {};
    CFG.PSYCHOLOGY_BEFORE.forEach(function (f) { out[f.key] = 5; });
    return out;
  }
  function emptyAfter() {
    var out = {};
    CFG.PSYCHOLOGY_AFTER.forEach(function (f) { out[f.key] = null; });
    return out;
  }
  function emptyPostTradeReview() {
    var out = { completed: false, quality: {}, qualityScore: null };
    CFG.POST_TRADE_YESNO.forEach(function (f) { out[f.key] = null; });
    CFG.POST_TRADE_TEXT.forEach(function (f) { out[f.key] = ''; });
    CFG.QUALITY_CATEGORIES.forEach(function (c) { out.quality[c.key] = null; });
    return out;
  }
  function createEmptyTrade() {
    return {
      id: null,
      status: 'planned', // planned -> executed -> closed
      isDemo: false,
      date: '', tradingDay: '',
      entryTime: '', exitTime: '',
      session: '', direction: 'buy', market: 'US30', timeframe: '15M',
      entryPrice: null, stopLoss: null, takeProfit: null, exitPrice: null,
      positionSize: null, riskAmount: null, riskPercent: null, pointValue: null,
      pnl: null, rMultiple: null, commission: 0, result: null,
      setup: '', setupGrade: 'No Grade', confidence: 5, confluenceScore: 0,
      smc: emptySmc(),
      liquidityMap: {
        location: '', targeted: '', swept: false, sweepQuality: '',
        postSweepDirection: '', intendedTarget: '', finalTargetReached: '',
        direction: 'unclear', outcome: 'unknown'
      },
      mtf: emptyMtf(),
      psychology: { before: emptyBefore(), after: emptyAfter(), disciplineScore: null },
      ruleCompliance: { results: [], compliant: null, total: null },
      preTradeChecklist: { emotionallyStable: null, followingPlan: null, completedAt: null },
      postTradeReview: emptyPostTradeReview(),
      screenshots: { htf: null, entrySetup: null, entryExecution: null, exit: null, postTrade: null },
      notes: '',
      createdAt: null, updatedAt: null
    };
  }

  // ---- Storage footprint ----------------------------------------------
  function estimateUsageBytes() {
    var total = 0;
    try {
      for (var k in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, k) && k.indexOf(P) === 0) {
          total += (localStorage.getItem(k) || '').length + k.length;
        }
      }
    } catch (e) { /* ignore */ }
    return total;
  }

  // ---- Demo data ----------------------------------------------------------
  function seedDemoDataIfNeeded() {
    var already = safeGet(KEYS.seeded, false);
    if (already) return false;
    var existing = getTrades();
    if (existing.length > 0) { safeSet(KEYS.seeded, true); return false; }
    var demo = global.DemoData.generate();
    saveTrades(demo);
    safeSet(KEYS.seeded, true);
    return true;
  }
  function clearDemoData() {
    var trades = getTrades().filter(function (t) { return !t.isDemo; });
    saveTrades(trades);
  }
  function hasDemoData() {
    return getTrades().some(function (t) { return t.isDemo; });
  }
  function wipeAll() {
    Object.keys(KEYS).forEach(function (k) { try { localStorage.removeItem(KEYS[k]); } catch (e) { /* ignore */ } });
  }

  global.Storage = {
    KEYS: KEYS,
    newId: newId,
    getTrades: getTrades, saveTrades: saveTrades, getTrade: getTrade,
    addTrade: addTrade, updateTrade: updateTrade, deleteTrade: deleteTrade,
    getSettings: getSettings, saveSettings: saveSettings,
    getRules: getRules, saveRules: saveRules,
    getReviews: getReviews, saveReview: saveReview,
    createEmptyTrade: createEmptyTrade,
    estimateUsageBytes: estimateUsageBytes,
    seedDemoDataIfNeeded: seedDemoDataIfNeeded,
    clearDemoData: clearDemoData,
    hasDemoData: hasDemoData,
    wipeAll: wipeAll
  };
})(window);
