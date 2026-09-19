/* ==========================================================================
   tradeForm.js — the Log Trade form. A single `workingTrade` object mirrors
   the DOM at all times: most inputs carry a data-bind path (assigned here,
   not hand-written in HTML) and a delegated listener on #trade-form writes
   straight into workingTrade, then recalcAll() re-derives every computed
   readout (risk math, confluence, discipline, rule compliance, the
   pre-trade checklist gate) from that single object.
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG, Calc = global.Calc, Storage = global.Storage, UI = global.UI;
  var qs = UI.qs, qsa = UI.qsa;

  var workingTrade = null;
  var mode = 'new';
  var editingId = null;

  var FIELD_BINDINGS = {
    'tf-date': 'date', 'tf-session': 'session', 'tf-timeframe': 'timeframe',
    'tf-entryTime': 'entryTime', 'tf-exitTime': 'exitTime',
    'tf-entryPrice': 'entryPrice', 'tf-stopLoss': 'stopLoss', 'tf-takeProfit': 'takeProfit', 'tf-exitPrice': 'exitPrice',
    'tf-positionSize': 'positionSize', 'tf-pnl': 'pnl', 'tf-commission': 'commission', 'tf-notes': 'notes',
    'tf-pointValue': 'pointValue', 'tf-setup': 'setup', 'tf-setupGrade': 'setupGrade', 'tf-confidence': 'confidence',
    'lm-location': 'liquidityMap.location', 'lm-targeted': 'liquidityMap.targeted',
    'lm-direction': 'liquidityMap.direction', 'lm-outcome': 'liquidityMap.outcome', 'lm-swept': 'liquidityMap.swept',
    'lm-sweepQuality': 'liquidityMap.sweepQuality', 'lm-postSweepDirection': 'liquidityMap.postSweepDirection',
    'lm-intendedTarget': 'liquidityMap.intendedTarget', 'lm-finalTargetReached': 'liquidityMap.finalTargetReached'
  };

  function getPath(obj, path) {
    var parts = path.split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) { if (cur === undefined || cur === null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function setPath(obj, path, value) {
    var parts = path.split('.'), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) { if (!cur[parts[i]]) cur[parts[i]] = {}; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = value;
  }
  function deepMerge(base, over) {
    if (Array.isArray(base)) return over !== undefined ? over : base;
    if (base !== null && typeof base === 'object') {
      var out = {};
      Object.keys(base).forEach(function (k) { out[k] = deepMerge(base[k], over ? over[k] : undefined); });
      if (over) Object.keys(over).forEach(function (k) { if (!(k in out)) out[k] = over[k]; });
      return out;
    }
    return over !== undefined ? over : base;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fillSelect(sel, options) {
    var el = qs(sel); if (!el) return;
    el.innerHTML = options.map(function (o) { return '<option value="' + UI.escapeHtml(o.value) + '">' + UI.escapeHtml(o.label) + '</option>'; }).join('');
  }

  // ---- One-time render of config-driven sections -----------------------------
  function applyFieldBindings() {
    Object.keys(FIELD_BINDINGS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.dataset.bind = FIELD_BINDINGS[id];
    });
  }
  function renderStaticOptions() {
    fillSelect('#tf-session', CFG.SESSION_ORDER.map(function (k) { return { value: k, label: CFG.DEFAULT_SESSIONS[k].label }; }));
    fillSelect('#tf-timeframe', CFG.TIMEFRAMES.map(function (t) { return { value: t, label: t }; }));
    fillSelect('#tf-setup', [{ value: '', label: 'Select a setup…' }].concat(CFG.SETUP_TYPES.map(function (s) { return { value: s.key, label: s.label }; })));
    fillSelect('#tf-setupGrade', CFG.SETUP_GRADES.map(function (g) { return { value: g, label: g }; }));
    fillSelect('#lm-direction', CFG.LIQUIDITY_DIRECTIONS.map(function (d) { return { value: d.key, label: d.label }; }));
    fillSelect('#lm-outcome', CFG.LIQUIDITY_OUTCOMES.map(function (o) { return { value: o.key, label: o.label }; }));
  }
  function renderSmcChecklist() {
    var container = qs('#smc-checklist-container'); container.innerHTML = '';
    Object.keys(CFG.SMC_CHECKLIST).forEach(function (groupKey) {
      var group = CFG.SMC_CHECKLIST[groupKey];
      var groupEl = document.createElement('div'); groupEl.className = 'smc-group';
      var title = document.createElement('div'); title.className = 'smc-group-title';
      title.innerHTML = '<span>' + group.label + '</span><span class="count" data-smc-count="' + groupKey + '">0/' + group.items.length + '</span>';
      groupEl.appendChild(title);
      var chipGrid = document.createElement('div'); chipGrid.className = 'chip-grid';
      group.items.forEach(function (item) {
        var label = document.createElement('label'); label.className = 'chip';
        label.innerHTML = '<input type="checkbox" data-bind="smc.' + groupKey + '.' + item.key + '" /><i class="fa-solid fa-check"></i><span>' + UI.escapeHtml(item.label) + '</span>';
        chipGrid.appendChild(label);
      });
      groupEl.appendChild(chipGrid);
      container.appendChild(groupEl);
    });
  }
  function renderMtfAccordion() {
    var container = qs('#mtf-container'); container.innerHTML = '';
    CFG.MTF_CONFIG.forEach(function (tf, idx) {
      var item = document.createElement('div'); item.className = 'mtf-item' + (idx === 0 ? ' open' : '');
      var head = document.createElement('div'); head.className = 'mtf-item-head';
      head.innerHTML = '<div class="mtf-item-head-left"><span class="mtf-tf-badge">' + tf.label + '</span><h3>' + tf.label + ' Analysis</h3></div><i class="fa-solid fa-chevron-down chevron"></i>';
      head.addEventListener('click', function () { item.classList.toggle('open'); });
      item.appendChild(head);
      var body = document.createElement('div'); body.className = 'mtf-item-body';
      tf.fields.forEach(function (f) {
        var field = document.createElement('div'); field.className = 'field';
        var bindPath = 'mtf.' + tf.key + '.' + f.key;
        var inner = '<label>' + f.label + '</label>';
        if (f.type === 'bias') {
          inner += '<select class="input" data-bind="' + bindPath + '"><option value="">\u2014</option>' + CFG.BIAS_OPTIONS.map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('') + '</select>';
        } else if (f.type === 'textarea') {
          inner += '<textarea class="input" rows="2" data-bind="' + bindPath + '"></textarea>';
        } else {
          inner += '<input type="text" class="input" data-bind="' + bindPath + '" />';
        }
        field.innerHTML = inner;
        body.appendChild(field);
      });
      item.appendChild(body);
      container.appendChild(item);
    });
  }
  function renderPsychBefore() {
    var container = qs('#psych-before-container'); container.innerHTML = '';
    CFG.PSYCHOLOGY_BEFORE.forEach(function (f) {
      var div = document.createElement('div'); div.className = 'field';
      div.innerHTML = '<label>' + f.label + ' (1\u201310): <span class="range-out" data-out="' + f.key + '">5</span></label>' +
        '<input type="range" min="1" max="10" value="5" class="range" data-bind="psychology.before.' + f.key + '" data-psych-before="' + f.key + '" />';
      container.appendChild(div);
    });
    container.addEventListener('input', function (e) {
      if (e.target.dataset.psychBefore) {
        var out = qs('[data-out="' + e.target.dataset.psychBefore + '"]', container);
        if (out) out.textContent = e.target.value;
      }
    });
  }
  function renderPsychAfter() {
    var container = qs('#psych-after-container'); container.innerHTML = '';
    CFG.PSYCHOLOGY_AFTER.forEach(function (f) {
      var row = document.createElement('div'); row.className = 'toggle-row'; row.dataset.key = f.key;
      row.innerHTML = '<span class="toggle-row-label">' + UI.escapeHtml(f.label) + '</span>' +
        '<div class="tri-toggle"><button type="button" class="tri-btn tri-yes" data-val="true">Yes</button><button type="button" class="tri-btn tri-no" data-val="false">No</button></div>';
      container.appendChild(row);
      row.querySelectorAll('.tri-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var newVal = btn.dataset.val === 'true';
          var current = workingTrade.psychology.after[f.key];
          workingTrade.psychology.after[f.key] = (current === newVal) ? null : newVal;
          syncPsychAfterUI();
          recalcAll();
        });
      });
    });
  }
  function syncPsychAfterUI() {
    qsa('#psych-after-container .toggle-row').forEach(function (row) {
      var val = workingTrade.psychology.after[row.dataset.key];
      row.querySelector('.tri-yes').classList.toggle('active', val === true);
      row.querySelector('.tri-no').classList.toggle('active', val === false);
    });
  }
  function renderPreTradeChecklist() {
    var container = qs('#pretrade-checklist-container'); container.innerHTML = '';
    CFG.PRE_TRADE_CHECKLIST.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'checklist-status-item' + (item.mode === 'manual' ? ' manual' : '');
      row.dataset.key = item.key;
      var html = '<span class="status-dot pending"><i class="fa-solid fa-minus"></i></span>' +
        '<span class="cs-label">' + UI.escapeHtml(item.label) + '</span><span class="cs-detail"></span>';
      if (item.mode === 'manual') {
        html += '<div class="tri-toggle"><button type="button" class="tri-btn tri-yes" data-val="true">Yes</button><button type="button" class="tri-btn tri-no" data-val="false">No</button></div>';
      }
      row.innerHTML = html;
      container.appendChild(row);
    });
    qsa('.checklist-status-item.manual', container).forEach(function (row) {
      var key = row.dataset.key;
      row.querySelectorAll('.tri-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var newVal = btn.dataset.val === 'true';
          var current = workingTrade.preTradeChecklist[key];
          workingTrade.preTradeChecklist[key] = (current === newVal) ? null : newVal;
          recalcAll();
        });
      });
    });
  }
  function renderScreenshotSlots() {
    var container = qs('#screenshots-container'); container.innerHTML = '';
    CFG.SCREENSHOT_SLOTS.forEach(function (slot) {
      var div = document.createElement('div'); div.className = 'screenshot-slot'; div.dataset.slot = slot.key;
      div.innerHTML = '<span class="slot-label">' + slot.label + '</span>' +
        '<div class="slot-media"><div class="slot-placeholder"><i class="fa-solid fa-image"></i></div></div>' +
        '<div class="slot-actions"><label class="btn btn-secondary btn-sm file-btn">Upload<input type="file" accept="image/*" class="slot-file" hidden /></label>' +
        '<button type="button" class="btn btn-ghost btn-sm slot-remove hidden">Remove</button></div>';
      container.appendChild(div);
      var fileInput = div.querySelector('.slot-file');
      var removeBtn = div.querySelector('.slot-remove');
      fileInput.addEventListener('change', function () {
        var file = fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        UI.compressImage(file, 1100, 0.72).then(function (dataUrl) {
          workingTrade.screenshots[slot.key] = dataUrl;
          syncScreenshotSlot(slot.key);
          updateStorageHint();
        }).catch(function (err) { UI.toast('Could not process that image: ' + err.message, 'error'); });
      });
      removeBtn.addEventListener('click', function () {
        workingTrade.screenshots[slot.key] = null;
        syncScreenshotSlot(slot.key);
        updateStorageHint();
      });
    });
  }
  function syncScreenshotSlot(slotKey) {
    var div = qs('.screenshot-slot[data-slot="' + slotKey + '"]');
    if (!div) return;
    var media = div.querySelector('.slot-media');
    var removeBtn = div.querySelector('.slot-remove');
    var val = workingTrade.screenshots[slotKey];
    if (val) {
      media.innerHTML = '<img class="slot-preview" src="' + val + '" alt="' + slotKey + ' screenshot" />';
      media.querySelector('img').addEventListener('click', function () { openImagePreview(val, slotKey); });
      removeBtn.classList.remove('hidden');
    } else {
      media.innerHTML = '<div class="slot-placeholder"><i class="fa-solid fa-image"></i></div>';
      removeBtn.classList.add('hidden');
    }
  }
  function syncAllScreenshotSlots() { CFG.SCREENSHOT_SLOTS.forEach(function (s) { syncScreenshotSlot(s.key); }); }
  function openImagePreview(src, title) {
    qs('#img-preview-src').src = src;
    qs('#img-preview-title').textContent = title;
    UI.openModal('modal-image-preview');
  }
  function renderRuleComplianceForm() {
    var container = qs('#rule-compliance-form-container'); container.innerHTML = '';
    var rules = Storage.getRules().filter(function (r) { return r.active; });
    var settings = Storage.getSettings();
    rules.forEach(function (rule) {
      var row = document.createElement('div'); row.className = 'rule-item';
      var ruleWithDefaults = Object.assign({ maxValue: settings.maxRiskPercent, minValue: settings.minRR }, rule);
      var auto = Calc.evaluateRule(workingTrade, ruleWithDefaults);
      row.innerHTML = '<span class="rule-text">' + UI.escapeHtml(rule.text) + '</span>';
      if (auto === null) {
        row.innerHTML += '<div class="tri-toggle" data-rule-manual="' + rule.id + '"><button type="button" class="tri-btn tri-yes" data-val="true">Followed</button><button type="button" class="tri-btn tri-no" data-val="false">Broken</button></div>';
      } else {
        row.innerHTML += '<span class="badge ' + (auto ? 'badge-win' : 'badge-loss') + '">' + (auto ? 'Followed' : 'Broken') + ' \u00B7 auto</span>';
      }
      container.appendChild(row);
    });
    qsa('[data-rule-manual]', container).forEach(function (wrap) {
      var ruleId = wrap.dataset.ruleManual;
      wrap.querySelectorAll('.tri-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var newVal = btn.dataset.val === 'true';
          setManualRuleResult(ruleId, newVal);
          renderRuleComplianceForm();
          recalcAll();
        });
      });
    });
    var results = workingTrade.ruleCompliance.results || [];
    qsa('[data-rule-manual]', container).forEach(function (wrap) {
      var r = results.filter(function (x) { return x.ruleId === wrap.dataset.ruleManual; })[0];
      var val = r ? r.followed : null;
      var yesBtn = wrap.querySelector('.tri-yes'), noBtn = wrap.querySelector('.tri-no');
      if (yesBtn) yesBtn.classList.toggle('active', val === true);
      if (noBtn) noBtn.classList.toggle('active', val === false);
    });
  }
  function setManualRuleResult(ruleId, val) {
    var results = (workingTrade.ruleCompliance.results || []).filter(function (r) { return r.ruleId !== ruleId; });
    var current = (workingTrade.ruleCompliance.results || []).filter(function (r) { return r.ruleId === ruleId; })[0];
    var newVal = (current && current.followed === val) ? null : val;
    results.push({ ruleId: ruleId, followed: newVal, manual: true });
    workingTrade.ruleCompliance.results = results;
  }

  // ---- Computed logic ---------------------------------------------------------
  function computeChecklistStatus(t, settings, rr) {
    var out = [];
    CFG.PRE_TRADE_CHECKLIST.forEach(function (item) {
      var ok = false, detail = '';
      switch (item.key) {
        case 'bias': ok = !!(t.mtf.daily.bias && t.mtf.daily.bias.trim()); detail = ok ? t.mtf.daily.bias : 'Set Daily bias (Multi-Timeframe tab)'; break;
        case 'liquidityLocation': ok = !!(t.liquidityMap.location && t.liquidityMap.location.trim()); detail = ok ? t.liquidityMap.location : 'Set location (Liquidity Map tab)'; break;
        case 'liquidityTarget': ok = !!(t.liquidityMap.targeted && t.liquidityMap.targeted.trim()); detail = ok ? t.liquidityMap.targeted : 'Set target (Liquidity Map tab)'; break;
        case 'poi': ok = !!((t.mtf.h1.poi && t.mtf.h1.poi.trim()) || (t.mtf.m15.poi && t.mtf.m15.poi.trim())); detail = ok ? 'Set' : 'Set 1H or 15M POI (Multi-Timeframe tab)'; break;
        case 'confirmation': ok = !!((t.mtf.m15.confirmation && t.mtf.m15.confirmation.trim()) || (t.mtf.m5.confirmation && t.mtf.m5.confirmation.trim())); detail = ok ? 'Set' : 'Set 15M or 5M confirmation (Multi-Timeframe tab)'; break;
        case 'invalidation': ok = Calc.isNum(t.stopLoss); detail = ok ? String(t.stopLoss) + ' (Stop Loss)' : 'Set Stop Loss (Trade Info tab)'; break;
        case 'risk': ok = Calc.isNum(t.riskPercent) && t.riskPercent > 0 && t.riskPercent <= settings.maxRiskPercent; detail = Calc.isNum(t.riskPercent) ? t.riskPercent + '% (limit ' + settings.maxRiskPercent + '%)' : 'Set Risk % (Trade Info tab)'; break;
        case 'target': ok = Calc.isNum(t.takeProfit); detail = ok ? String(t.takeProfit) : 'Set Take Profit (Trade Info tab)'; break;
        case 'rrOk': ok = rr !== null && rr >= settings.minRR; detail = rr !== null ? rr.toFixed(2) + 'R (min ' + settings.minRR + 'R)' : 'Needs Entry / Stop / Target'; break;
        case 'inSession': ok = !!t.session; detail = t.session ? CFG.DEFAULT_SESSIONS[t.session].label : 'Select a session (Trade Info tab)'; break;
        case 'emotionallyStable': case 'followingPlan': {
          var v = t.preTradeChecklist[item.key];
          out.push({ key: item.key, label: item.label, mode: item.mode, status: v === true ? 'ok' : v === false ? 'fail' : 'pending', detail: 'Self-assessment' });
          return;
        }
      }
      out.push({ key: item.key, label: item.label, mode: item.mode, status: ok ? 'ok' : 'fail', detail: detail });
    });
    return out;
  }
  function syncPreTradeChecklistUI(statusArray) {
    var container = qs('#pretrade-checklist-container');
    statusArray.forEach(function (s) {
      var row = qs('.checklist-status-item[data-key="' + s.key + '"]', container);
      if (!row) return;
      var dot = row.querySelector('.status-dot');
      dot.className = 'status-dot ' + (s.status === 'ok' ? 'ok' : s.status === 'pending' ? 'pending' : 'fail');
      dot.innerHTML = '<i class="fa-solid fa-' + (s.status === 'ok' ? 'check' : s.status === 'pending' ? 'minus' : 'xmark') + '"></i>';
      row.querySelector('.cs-detail').textContent = s.detail || '';
      if (s.mode === 'manual') {
        var val = getPath(workingTrade, 'preTradeChecklist.' + s.key);
        var yesBtn = row.querySelector('.tri-yes'), noBtn = row.querySelector('.tri-no');
        if (yesBtn) yesBtn.classList.toggle('active', val === true);
        if (noBtn) noBtn.classList.toggle('active', val === false);
      }
    });
  }
  function checkDailyStop(t, settings) {
    if (t.date !== UI.todayIso()) return null;
    var todayClosed = Storage.getTrades().filter(function (x) { return x.id !== editingId && x.date === t.date && x.status === 'closed' && Calc.isNum(x.rMultiple); });
    var dayR = todayClosed.reduce(function (s, x) { return s + x.rMultiple; }, 0);
    return dayR <= -settings.maxDailyLossR ? dayR : null;
  }
  function toggleTabFlag(tabKey, show) {
    var btn = qs('.form-tab[data-tab="' + tabKey + '"]');
    if (btn) btn.classList.toggle('tab-flag', !!show);
  }

  // ---- Master recalculation ---------------------------------------------------
  function recalcAll() {
    if (!workingTrade) return;
    var settings = Storage.getSettings();
    var balance = Calc.calcCurrentBalance(Storage.getTrades().filter(function (t) { return t.id !== editingId; }), settings.startingBalance);

    workingTrade.tradingDay = Calc.calcTradingDay(workingTrade.date);
    var tdEl = qs('#tf-tradingDay'); if (tdEl) tdEl.value = workingTrade.tradingDay;

    workingTrade.rMultiple = Calc.calcRMultiple(workingTrade.pnl, workingTrade.riskAmount);
    workingTrade.result = Calc.calcResult(workingTrade.pnl);
    qs('#tf-rMultiple').value = workingTrade.rMultiple === null ? '' : UI.formatR(workingTrade.rMultiple);
    qs('#tf-result').value = workingTrade.result ? cap(workingTrade.result) : '';

    var stopDist = Calc.calcStopDistance(workingTrade.entryPrice, workingTrade.stopLoss);
    var targetDist = Calc.calcTargetDistance(workingTrade.entryPrice, workingTrade.takeProfit);
    var rr = Calc.calcRR(workingTrade.entryPrice, workingTrade.stopLoss, workingTrade.takeProfit);
    var potentialProfit = Calc.calcPotentialProfit(workingTrade.riskAmount, rr);
    qs('#risk-balance').textContent = UI.formatCurrency(balance, settings.currency);
    qs('#risk-stopDist').textContent = stopDist === null ? '\u2014' : stopDist.toFixed(1) + ' pts';
    qs('#risk-targetDist').textContent = targetDist === null ? '\u2014' : targetDist.toFixed(1) + ' pts';
    qs('#risk-rr').textContent = rr === null ? '\u2014' : rr.toFixed(2) + 'R';
    qs('#risk-potentialProfit').textContent = potentialProfit === null ? '\u2014' : UI.formatCurrency(potentialProfit, settings.currency);
    qs('#risk-potentialLoss').textContent = Calc.isNum(workingTrade.riskAmount) ? UI.formatCurrency(-Math.abs(workingTrade.riskAmount), settings.currency) : '\u2014';

    // warnings
    var warnEls = [];
    var dailyStopR = checkDailyStop(workingTrade, settings);
    if (dailyStopR !== null) warnEls.push('<div class="alert-banner alert-danger"><span><i class="fa-solid fa-hand"></i> DAILY STOP \u2014 NO MORE TRADES (today: ' + UI.formatR(dailyStopR) + ')</span></div>');
    if (Calc.isNum(workingTrade.riskPercent) && workingTrade.riskPercent > settings.maxRiskPercent) {
      warnEls.push('<div class="alert-banner alert-danger"><span><i class="fa-solid fa-triangle-exclamation"></i> HIGH RISK \u2014 TRADE EXCEEDS YOUR RISK LIMIT (' + workingTrade.riskPercent + '% &gt; ' + settings.maxRiskPercent + '%)</span></div>');
    }
    if (rr !== null && rr < settings.minRR) {
      warnEls.push('<div class="alert-banner alert-warn"><span><i class="fa-solid fa-triangle-exclamation"></i> LOW R:R \u2014 SETUP DOES NOT MEET MINIMUM STANDARD (' + rr.toFixed(2) + 'R &lt; ' + settings.minRR + 'R)</span></div>');
    }
    var dirError = null;
    if (Calc.isNum(workingTrade.entryPrice) && Calc.isNum(workingTrade.stopLoss)) {
      if (workingTrade.direction === 'buy' && workingTrade.stopLoss >= workingTrade.entryPrice) dirError = 'Stop Loss must be below Entry Price for a Buy trade.';
      if (workingTrade.direction === 'sell' && workingTrade.stopLoss <= workingTrade.entryPrice) dirError = 'Stop Loss must be above Entry Price for a Sell trade.';
      if (dirError) warnEls.push('<div class="alert-banner alert-danger"><span><i class="fa-solid fa-xmark"></i> ' + dirError + '</span></div>');
    }
    qs('#logtrade-warnings').innerHTML = warnEls.join('');
    qs('#risk-warnings').innerHTML = warnEls.length ? warnEls.join('') : '';

    // confluence
    workingTrade.confluenceScore = Calc.calcConfluenceScore(workingTrade.smc);
    qs('#setup-confluence-readout').textContent = workingTrade.confluenceScore + '% \u00B7 ' + UI.confluenceTier(workingTrade.confluenceScore);
    Object.keys(CFG.SMC_CHECKLIST).forEach(function (groupKey) {
      var group = CFG.SMC_CHECKLIST[groupKey];
      var checked = group.items.filter(function (it) { return workingTrade.smc[groupKey][it.key]; }).length;
      var el = qs('[data-smc-count="' + groupKey + '"]');
      if (el) el.textContent = checked + '/' + group.items.length;
    });

    // discipline
    workingTrade.psychology.disciplineScore = Calc.calcDisciplineScore(workingTrade.psychology.after);
    qs('#discipline-readout').textContent = workingTrade.psychology.disciplineScore === null ? 'Pending' : workingTrade.psychology.disciplineScore.toFixed(1) + '/10';

    // rule compliance
    var rc = Calc.calcRuleCompliance(workingTrade, Storage.getRules(), settings);
    workingTrade.ruleCompliance.compliant = rc.compliant;
    workingTrade.ruleCompliance.total = rc.total;
    qs('#rule-compliance-readout').textContent = rc.compliant + '/' + rc.total;

    // pre-trade checklist
    var checklist = computeChecklistStatus(workingTrade, settings, rr);
    syncPreTradeChecklistUI(checklist);
    var allOk = checklist.every(function (c) { return c.status === 'ok'; });
    var blocked = !allOk || dirError || dailyStopR !== null;
    var execBtn = qs('#btn-save-executed');
    execBtn.disabled = !!blocked;
    execBtn.title = blocked ? (dailyStopR !== null ? 'Daily loss limit reached' : (dirError || 'Complete the Pre-Trade Checklist first')) : '';
    toggleTabFlag('checklist', !allOk);
    toggleTabFlag('risk', !!(dirError || (rr !== null && rr < settings.minRR) || (Calc.isNum(workingTrade.riskPercent) && workingTrade.riskPercent > settings.maxRiskPercent)));

    qs('#tf-posSizeUnitLabel').textContent = '(' + (settings.positionSizeUnit || 'lots') + ')';
    syncStatusBadge();
    updateStorageHint();
  }
  function syncStatusBadge() {
    var badge = qs('#logtrade-status-badge');
    badge.textContent = cap(workingTrade.status);
    badge.className = 'status-pill status-' + workingTrade.status;
  }
  function updateStorageHint() {
    var bytes = Storage.estimateUsageBytes();
    var pendingBytes = JSON.stringify(workingTrade.screenshots || {}).length;
    var approxKB = Math.round((bytes + pendingBytes) / 1024);
    var el = qs('#storage-usage-hint');
    if (el) el.textContent = 'Local storage in use: ~' + approxKB.toLocaleString() + ' KB';
  }

  // ---- Field wiring ---------------------------------------------------------
  function extractValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range') return el.value === '' ? null : Number(el.value);
    return el.value;
  }
  function handleFieldChange(e) {
    var el = e.target;
    var bind = el.dataset.bind;
    if (!bind) return;
    setPath(workingTrade, bind, extractValue(el));
    if (el.type === 'checkbox') { var chip = el.closest('.chip'); if (chip) chip.classList.toggle('checked', el.checked); }
    recalcAll();
  }
  function populateBoundFields() {
    qsa('[data-bind]').forEach(function (el) {
      var val = getPath(workingTrade, el.dataset.bind);
      if (el.type === 'checkbox') {
        el.checked = !!val;
        var chip = el.closest('.chip'); if (chip) chip.classList.toggle('checked', !!val);
      } else {
        el.value = (val === null || val === undefined) ? '' : val;
      }
    });
  }
  function setDirectionUI(direction) {
    qsa('#tf-direction .seg-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.value === direction); });
  }
  function wireStaticListeners() {
    var form = qs('#trade-form');
    form.addEventListener('input', handleFieldChange);
    form.addEventListener('change', handleFieldChange);

    qsa('#tf-direction .seg-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        workingTrade.direction = btn.dataset.value;
        setDirectionUI(workingTrade.direction);
        recalcAll();
      });
    });
    qs('#tf-confidence').addEventListener('input', function (e) { qs('#tf-confidence-out').textContent = e.target.value; });

    qs('#tf-riskPercent').addEventListener('input', function (e) {
      var v = e.target.value === '' ? null : Number(e.target.value);
      workingTrade.riskPercent = v;
      var settings = Storage.getSettings();
      var balance = Calc.calcCurrentBalance(Storage.getTrades().filter(function (t) { return t.id !== editingId; }), settings.startingBalance);
      workingTrade.riskAmount = Calc.calcRiskAmountFromPercent(balance, v);
      qs('#tf-riskAmount').value = workingTrade.riskAmount === null ? '' : Math.round(workingTrade.riskAmount * 100) / 100;
      recalcAll();
    });
    qs('#tf-riskAmount').addEventListener('input', function (e) {
      var v = e.target.value === '' ? null : Number(e.target.value);
      workingTrade.riskAmount = v;
      var settings = Storage.getSettings();
      var balance = Calc.calcCurrentBalance(Storage.getTrades().filter(function (t) { return t.id !== editingId; }), settings.startingBalance);
      workingTrade.riskPercent = Calc.calcRiskPercentFromAmount(balance, v);
      qs('#tf-riskPercent').value = workingTrade.riskPercent === null ? '' : Math.round(workingTrade.riskPercent * 10000) / 10000;
      recalcAll();
    });

    qs('#btn-suggest-pnl').addEventListener('click', function () {
      var suggestion = Calc.suggestPnl(workingTrade.direction, workingTrade.entryPrice, workingTrade.exitPrice, workingTrade.positionSize, workingTrade.pointValue, workingTrade.commission);
      if (suggestion === null) { UI.toast('Fill in Exit Price, Position Size and Point Value first.', 'error'); return; }
      workingTrade.pnl = Math.round(suggestion * 100) / 100;
      qs('#tf-pnl').value = workingTrade.pnl;
      recalcAll();
    });

    qs('#btn-save-planned').addEventListener('click', saveAsPlanned);
    form.addEventListener('submit', saveAsExecuted);
    qs('#btn-delete-trade').addEventListener('click', deleteCurrent);

    UI.initTabs('#form-tabs', '.tab-panel');
  }

  // ---- Validation & save -----------------------------------------------------
  function showFormErrors(errors) {
    qs('#logtrade-warnings').innerHTML = errors.map(function (m) {
      return '<div class="alert-banner alert-danger"><span><i class="fa-solid fa-triangle-exclamation"></i> ' + UI.escapeHtml(m) + '</span></div>';
    }).join('');
    window.scrollTo(0, 0);
  }
  function validateCore(t) {
    var errors = [];
    if (!t.date) errors.push('Date is required.');
    if (!t.session) errors.push('Session is required.');
    if (!Calc.isNum(t.entryPrice)) errors.push('Entry Price is required.');
    if (!Calc.isNum(t.stopLoss)) errors.push('Stop Loss is required.');
    if (Calc.isNum(t.entryPrice) && Calc.isNum(t.stopLoss)) {
      if (t.direction === 'buy' && t.stopLoss >= t.entryPrice) errors.push('Stop Loss must be below Entry Price for a Buy trade.');
      if (t.direction === 'sell' && t.stopLoss <= t.entryPrice) errors.push('Stop Loss must be above Entry Price for a Sell trade.');
    }
    if (!Calc.isNum(t.riskPercent) || t.riskPercent <= 0) errors.push('Risk % must be greater than zero.');
    if (!t.setup) errors.push('Setup Type is required.');
    return errors;
  }
  function saveAsPlanned() {
    var errors = [];
    if (!workingTrade.date) errors.push('Date is required.');
    if (!workingTrade.session) errors.push('Session is required.');
    if (errors.length) { showFormErrors(errors); return; }
    workingTrade.status = 'planned';
    persistAndFinish();
  }
  function saveAsExecuted(e) {
    if (e) e.preventDefault();
    var errors = validateCore(workingTrade);
    var settings = Storage.getSettings();
    var rr = Calc.calcRR(workingTrade.entryPrice, workingTrade.stopLoss, workingTrade.takeProfit);
    var checklist = computeChecklistStatus(workingTrade, settings, rr);
    var allOk = checklist.every(function (c) { return c.status === 'ok'; });
    if (!allOk) errors.push('Complete the Pre-Trade Checklist before saving as Executed.');
    var dailyStopR = checkDailyStop(workingTrade, settings);
    if (dailyStopR !== null) errors.push('Daily loss limit reached \u2014 no more trades can be marked Executed today.');
    if (errors.length) {
      showFormErrors(errors);
      if (!allOk) UI.setActiveTab('#form-tabs', '.tab-panel', 'checklist');
      return;
    }
    var priorReviewDone = mode === 'edit' && editingId ? !!((Storage.getTrade(editingId) || {}).postTradeReview || {}).completed : false;
    workingTrade.status = (Calc.isNum(workingTrade.exitPrice) && Calc.isNum(workingTrade.pnl)) ? 'closed' : 'executed';
    var saved = persistAndFinish();
    if (saved && saved.status === 'closed' && !priorReviewDone && global.Journal && global.Journal.openPostTradeReview) {
      setTimeout(function () { global.Journal.openPostTradeReview(saved.id); }, 60);
    }
  }
  function persistAndFinish() {
    var saved;
    if (mode === 'edit' && editingId) { saved = Storage.updateTrade(editingId, workingTrade); }
    else { saved = Storage.addTrade(workingTrade); editingId = saved.id; mode = 'edit'; }
    if (global.App && global.App.refreshAll) global.App.refreshAll();
    UI.toast('Trade saved.', 'success');
    UI.showPage('journal');
    return saved;
  }
  function deleteCurrent() {
    if (!editingId) return;
    UI.showConfirm('Delete this trade?', 'This permanently removes it from your journal. This cannot be undone.', function () {
      Storage.deleteTrade(editingId);
      if (global.App && global.App.refreshAll) global.App.refreshAll();
      UI.toast('Trade deleted.', 'info');
      UI.showPage('journal');
    }, 'Delete');
  }

  // ---- Public: open new / edit --------------------------------------------
  function populateFormFromWorkingTrade() {
    qs('#tf-id').value = workingTrade.id || '(assigned on save)';
    populateBoundFields();
    qs('#tf-riskPercent').value = workingTrade.riskPercent === null || workingTrade.riskPercent === undefined ? '' : workingTrade.riskPercent;
    qs('#tf-riskAmount').value = workingTrade.riskAmount === null || workingTrade.riskAmount === undefined ? '' : workingTrade.riskAmount;
    qs('#tf-confidence-out').textContent = workingTrade.confidence || 5;
    setDirectionUI(workingTrade.direction);
    syncPsychAfterUI();
    syncAllScreenshotSlots();
    CFG.PSYCHOLOGY_BEFORE.forEach(function (f) {
      var out = qs('[data-out="' + f.key + '"]');
      if (out) out.textContent = workingTrade.psychology.before[f.key];
    });
    renderRuleComplianceForm();
    recalcAll();
  }
  function openNew() {
    mode = 'new'; editingId = null;
    workingTrade = Storage.createEmptyTrade();
    workingTrade.date = UI.todayIso();
    qs('#logtrade-title').textContent = 'Log Trade';
    qs('#btn-delete-trade').classList.add('hidden');
    populateFormFromWorkingTrade();
    UI.setActiveTab('#form-tabs', '.tab-panel', 'info');
  }
  function openEdit(id) {
    var t = Storage.getTrade(id);
    if (!t) { UI.toast('Trade not found.', 'error'); return; }
    mode = 'edit'; editingId = id;
    workingTrade = deepMerge(Storage.createEmptyTrade(), JSON.parse(JSON.stringify(t)));
    qs('#logtrade-title').textContent = 'Edit Trade';
    qs('#btn-delete-trade').classList.remove('hidden');
    populateFormFromWorkingTrade();
    UI.setActiveTab('#form-tabs', '.tab-panel', 'info');
    UI.showPage('logtrade');
  }

  function init() {
    applyFieldBindings();
    renderStaticOptions();
    renderSmcChecklist();
    renderMtfAccordion();
    renderPsychBefore();
    renderPsychAfter();
    renderPreTradeChecklist();
    renderScreenshotSlots();
    wireStaticListeners();
    openNew();
    UI.registerPageRefresh('logtrade', function () { if (mode === 'new' && isFormEffectivelyEmpty()) openNew(); });
  }
  function isFormEffectivelyEmpty() {
    if (!workingTrade) return true;
    return !workingTrade.entryPrice && !workingTrade.stopLoss && !workingTrade.setup && !workingTrade.session && !workingTrade.notes;
  }

  global.TradeForm = { init: init, openNew: openNew, openEdit: openEdit };
})(window);
