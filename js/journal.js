/* ==========================================================================
   journal.js — the Journal table, the read-only trade-detail modal, and the
   Post-Trade Review modal. openPostTradeReview is called both automatically
   (tradeForm.js, right after a trade transitions to 'closed') and manually
   (the "Edit Review" button here), so both paths share one implementation.
   ========================================================================== */
(function (global) {
  'use strict';
  var CFG = global.CFG, Calc = global.Calc, Storage = global.Storage, UI = global.UI;
  var qs = UI.qs, qsa = UI.qsa;

  var filters = { search: '', session: '', setup: '', direction: '', result: '', grade: '', dateFrom: '', dateTo: '' };
  var sortKey = 'date', sortDir = 'desc';
  var sortLabels = {};

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function setupLabel(key) { var m = CFG.SETUP_TYPES.filter(function (s) { return s.key === key; }); return m.length ? m[0].label : (key || '\u2014'); }
  function sessionLabel(key) { return key && CFG.DEFAULT_SESSIONS[key] ? CFG.DEFAULT_SESSIONS[key].label : '\u2014'; }
  function liqDirLabel(key) { var m = CFG.LIQUIDITY_DIRECTIONS.filter(function (d) { return d.key === key; }); return m.length ? m[0].label : '\u2014'; }
  function liqOutcomeLabel(key) { var m = CFG.LIQUIDITY_OUTCOMES.filter(function (o) { return o.key === key; }); return m.length ? m[0].label : '\u2014'; }

  // ---- Filtering / sorting ---------------------------------------------------
  function matchesFilters(t) {
    if (filters.session && t.session !== filters.session) return false;
    if (filters.setup && t.setup !== filters.setup) return false;
    if (filters.direction && t.direction !== filters.direction) return false;
    if (filters.result && t.result !== filters.result) return false;
    if (filters.grade && t.setupGrade !== filters.grade) return false;
    if (filters.dateFrom && t.date < filters.dateFrom) return false;
    if (filters.dateTo && t.date > filters.dateTo) return false;
    if (filters.search) {
      var hay = [t.notes, setupLabel(t.setup), sessionLabel(t.session), t.liquidityMap && t.liquidityMap.location, t.liquidityMap && t.liquidityMap.targeted].join(' ').toLowerCase();
      if (hay.indexOf(filters.search.toLowerCase()) === -1) return false;
    }
    return true;
  }
  function getSortValue(t, key) {
    switch (key) {
      case 'date': return (t.date || '') + 'T' + (t.entryTime || '00:00');
      case 'entryPrice': return t.entryPrice; case 'exitPrice': return t.exitPrice;
      case 'riskAmount': return t.riskAmount; case 'rMultiple': return t.rMultiple; case 'pnl': return t.pnl;
      case 'disciplineScore': return t.psychology && t.psychology.disciplineScore;
      case 'direction': case 'session': case 'setup': case 'setupGrade': case 'result': return t[key] || '';
      default: return '';
    }
  }
  function compareTrades(a, b) {
    var va = getSortValue(a, sortKey), vb = getSortValue(b, sortKey);
    var na = (va === null || va === undefined), nb = (vb === null || vb === undefined);
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    var cmp = (typeof va === 'number' && typeof vb === 'number') ? (va - vb) : String(va).localeCompare(String(vb));
    return sortDir === 'asc' ? cmp : -cmp;
  }

  // ---- Row rendering ----------------------------------------------------------
  function resultBadge(result) {
    if (!result) return '<span class="badge badge-neutral">\u2014</span>';
    var map = { win: 'badge-win', loss: 'badge-loss', breakeven: 'badge-breakeven' };
    return '<span class="badge ' + (map[result] || 'badge-neutral') + '">' + cap(result) + '</span>';
  }
  function gradeBadge(grade) {
    if (!grade || grade === 'No Grade') return '\u2014';
    return '<span class="badge badge-grade-' + grade.replace('+', 'p') + '">' + grade + '</span>';
  }
  function renderRow(t, settings) {
    return '<tr data-id="' + t.id + '">' +
      '<td>' + UI.formatDate(t.date) + '</td>' +
      '<td>' + (t.isDemo ? '<span class="badge badge-info" title="Demo data">DEMO</span> ' : '') + (t.tradingDay ? t.tradingDay.slice(0, 3) : '\u2014') + '</td>' +
      '<td><span class="badge badge-' + t.direction + '">' + cap(t.direction) + '</span></td>' +
      '<td>' + sessionLabel(t.session) + '</td>' +
      '<td>' + UI.escapeHtml(setupLabel(t.setup)) + '</td>' +
      '<td class="mono">' + (t.entryPrice != null ? t.entryPrice : '\u2014') + '</td>' +
      '<td class="mono">' + (t.exitPrice != null ? t.exitPrice : '\u2014') + '</td>' +
      '<td class="mono">' + (t.riskAmount != null ? UI.formatCurrency(t.riskAmount, settings.currency) : '\u2014') + '</td>' +
      '<td class="mono">' + UI.formatR(t.rMultiple) + '</td>' +
      '<td class="mono ' + UI.toneClass(t.pnl || 0) + '">' + (t.pnl != null ? UI.formatCurrency(t.pnl, settings.currency) : '\u2014') + '</td>' +
      '<td>' + gradeBadge(t.setupGrade) + '</td>' +
      '<td class="mono">' + (t.psychology && t.psychology.disciplineScore != null ? t.psychology.disciplineScore.toFixed(1) : '\u2014') + '</td>' +
      '<td>' + resultBadge(t.result) + '</td>' +
      '</tr>';
  }
  function render() {
    var settings = Storage.getSettings();
    var trades = Storage.getTrades();
    var filtered = trades.filter(matchesFilters).sort(compareTrades);
    var tbody = qs('#journal-tbody');
    tbody.innerHTML = filtered.map(function (t) { return renderRow(t, settings); }).join('');
    qsa('tr', tbody).forEach(function (tr) { tr.addEventListener('click', function () { openTradeDetail(tr.dataset.id); }); });
    var empty = qs('#journal-empty');
    empty.classList.toggle('hidden', filtered.length > 0);
    if (!filtered.length) {
      empty.innerHTML = trades.length
        ? '<i class="fa-solid fa-filter"></i>No trades match these filters.'
        : '<i class="fa-solid fa-book"></i>No trades logged yet. Click "Log Trade" to add your first one.';
    }
    updateSortIndicators();
  }
  function updateSortIndicators() {
    qsa('#journal-table th[data-sort]').forEach(function (th) {
      var label = sortLabels[th.dataset.sort] || th.textContent;
      th.innerHTML = label + (th.dataset.sort === sortKey ? ' <span class="sort-caret">' + (sortDir === 'asc' ? '\u25B2' : '\u25BC') + '</span>' : '');
    });
  }

  function initFilters() {
    UI.fillSelect('#filter-session', [{ value: '', label: 'All Sessions' }].concat(CFG.SESSION_ORDER.map(function (k) { return { value: k, label: CFG.DEFAULT_SESSIONS[k].label }; })));
    UI.fillSelect('#filter-setup', [{ value: '', label: 'All Setups' }].concat(CFG.SETUP_TYPES.map(function (s) { return { value: s.key, label: s.label }; })));
    UI.fillSelect('#filter-grade', [{ value: '', label: 'All Grades' }].concat(CFG.SETUP_GRADES.map(function (g) { return { value: g, label: g }; })));

    qs('#journal-search').addEventListener('input', UI.debounce(function (e) { filters.search = e.target.value; render(); }, 180));
    qs('#filter-session').addEventListener('change', function (e) { filters.session = e.target.value; render(); });
    qs('#filter-setup').addEventListener('change', function (e) { filters.setup = e.target.value; render(); });
    qs('#filter-direction').addEventListener('change', function (e) { filters.direction = e.target.value; render(); });
    qs('#filter-result').addEventListener('change', function (e) { filters.result = e.target.value; render(); });
    qs('#filter-grade').addEventListener('change', function (e) { filters.grade = e.target.value; render(); });
    qs('#filter-date-from').addEventListener('change', function (e) { filters.dateFrom = e.target.value; render(); });
    qs('#filter-date-to').addEventListener('change', function (e) { filters.dateTo = e.target.value; render(); });
    qs('#btn-clear-filters').addEventListener('click', function () {
      filters = { search: '', session: '', setup: '', direction: '', result: '', grade: '', dateFrom: '', dateTo: '' };
      ['#journal-search', '#filter-session', '#filter-setup', '#filter-direction', '#filter-result', '#filter-grade', '#filter-date-from', '#filter-date-to'].forEach(function (s) { qs(s).value = ''; });
      render();
    });
    qsa('#journal-table th[data-sort]').forEach(function (th) {
      sortLabels[th.dataset.sort] = th.textContent.trim();
      th.addEventListener('click', function () {
        if (sortKey === th.dataset.sort) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = th.dataset.sort; sortDir = 'asc'; }
        render();
      });
    });
  }

  // ---- Trade detail modal ------------------------------------------------------
  function kv(label, value) {
    return '<div class="td-kv"><span class="td-kv-label">' + UI.escapeHtml(label) + '</span><span class="td-kv-value">' + ((value === null || value === undefined || value === '') ? '\u2014' : UI.escapeHtml(String(value))) + '</span></div>';
  }
  function section(title, inner) { return '<div class="td-section"><div class="td-section-title">' + UI.escapeHtml(title) + '</div>' + inner + '</div>'; }
  function checkedList(groupObj, groupConfig) {
    var checked = groupConfig.items.filter(function (it) { return groupObj && groupObj[it.key]; }).map(function (it) { return it.label; });
    return checked.length ? checked.join(', ') : 'None selected';
  }
  function buildTradeDetailHtml(t, settings) {
    var rr = Calc.calcRR(t.entryPrice, t.stopLoss, t.takeProfit);
    var html = '';
    html += section('Overview', '<div class="td-kv-grid">' +
      kv('Status', cap(t.status)) + kv('Session', sessionLabel(t.session)) + kv('Setup', setupLabel(t.setup)) +
      kv('Grade', t.setupGrade) + kv('Confidence', t.confidence + '/10') +
      kv('Confluence', t.confluenceScore + '% (' + UI.confluenceTier(t.confluenceScore) + ')') +
      kv('R-Multiple', UI.formatR(t.rMultiple)) + kv('P&L', t.pnl != null ? UI.formatCurrency(t.pnl, settings.currency) : null) +
      kv('Result', t.result ? cap(t.result) : null) + kv('Discipline', t.psychology.disciplineScore != null ? t.psychology.disciplineScore.toFixed(1) + '/10' : 'Pending') +
      '</div>');
    html += section('Trade Details', '<div class="td-kv-grid">' +
      kv('Date', UI.formatDate(t.date)) + kv('Trading Day', t.tradingDay) + kv('Entry Time', t.entryTime) + kv('Exit Time', t.exitTime) +
      kv('Direction', cap(t.direction)) + kv('Timeframe', t.timeframe) + kv('Entry', t.entryPrice) + kv('Stop Loss', t.stopLoss) +
      kv('Take Profit', t.takeProfit) + kv('Exit', t.exitPrice) + kv('Position Size', t.positionSize) +
      kv('Commission', t.commission != null ? UI.formatCurrency(t.commission, settings.currency) : null) +
      '</div>');
    html += section('Risk Management', '<div class="td-kv-grid">' +
      kv('Risk Amount', t.riskAmount != null ? UI.formatCurrency(t.riskAmount, settings.currency) : null) +
      kv('Risk %', t.riskPercent != null ? t.riskPercent + '%' : null) +
      kv('Risk : Reward', rr != null ? rr.toFixed(2) + 'R' : null) +
      '</div>');
    html += section('SMC Analysis', '<div class="td-kv-grid">' +
      kv('Market Structure', checkedList(t.smc.marketStructure, CFG.SMC_CHECKLIST.marketStructure)) +
      kv('Liquidity', checkedList(t.smc.liquidity, CFG.SMC_CHECKLIST.liquidity)) +
      kv('Price Delivery', checkedList(t.smc.priceDelivery, CFG.SMC_CHECKLIST.priceDelivery)) +
      '</div>');
    html += section('Liquidity Map', '<div class="td-kv-grid">' +
      kv('Location', t.liquidityMap.location) + kv('Targeted', t.liquidityMap.targeted) +
      kv('Swept', t.liquidityMap.swept ? 'Yes' : 'No') + kv('Sweep Quality', t.liquidityMap.sweepQuality) +
      kv('Direction', liqDirLabel(t.liquidityMap.direction)) + kv('Outcome', liqOutcomeLabel(t.liquidityMap.outcome)) +
      '</div>');
    var rc = Calc.calcRuleCompliance(t, Storage.getRules(), settings);
    html += section('Rule Compliance (' + rc.compliant + '/' + rc.total + ')', '<div class="rules-list">' +
      rc.results.map(function (r) {
        var cls = r.followed === true ? 'badge-win' : r.followed === false ? 'badge-loss' : 'badge-neutral';
        var label = r.followed === true ? 'Followed' : r.followed === false ? 'Broken' : 'Not assessed';
        return '<div class="rule-item"><span class="rule-text">' + UI.escapeHtml(r.text) + '</span><span class="badge ' + cls + '">' + label + '</span></div>';
      }).join('') + '</div>');
    if (t.postTradeReview && t.postTradeReview.completed) {
      html += section('Post-Trade Review \u2014 Quality Score ' + t.postTradeReview.qualityScore + '/100',
        (t.postTradeReview.lesson ? '<p class="hint" style="margin-bottom:10px">' + UI.escapeHtml(t.postTradeReview.lesson) + '</p>' : '') +
        '<button type="button" class="btn btn-secondary btn-sm" id="td-open-review">Edit Review</button>');
    } else if (t.status === 'closed') {
      html += section('Post-Trade Review', '<button type="button" class="btn btn-primary btn-sm" id="td-open-review">Complete Post-Trade Review</button>');
    }
    var shots = CFG.SCREENSHOT_SLOTS.filter(function (s) { return t.screenshots && t.screenshots[s.key]; });
    if (shots.length) {
      html += section('Screenshots', '<div class="td-screens">' + shots.map(function (s) {
        return '<img src="' + t.screenshots[s.key] + '" data-slot-title="' + UI.escapeHtml(s.label) + '" alt="' + UI.escapeHtml(s.label) + '" />';
      }).join('') + '</div>');
    }
    if (t.notes) html += section('Notes', '<p style="white-space:pre-wrap">' + UI.escapeHtml(t.notes) + '</p>');
    html += '<div class="td-actions">' +
      '<button class="btn btn-primary btn-sm" id="td-edit-btn"><i class="fa-solid fa-pen"></i> Edit</button>' +
      '<button class="btn btn-danger btn-sm" id="td-delete-btn"><i class="fa-solid fa-trash"></i> Delete</button>' +
      '</div>';
    return html;
  }
  function wireTradeDetailActions(t) {
    var editBtn = qs('#td-edit-btn');
    if (editBtn) editBtn.addEventListener('click', function () { UI.closeModal('modal-trade-detail'); global.TradeForm.openEdit(t.id); });
    var delBtn = qs('#td-delete-btn');
    if (delBtn) delBtn.addEventListener('click', function () {
      UI.showConfirm('Delete this trade?', 'This permanently removes it from your journal.', function () {
        Storage.deleteTrade(t.id);
        UI.closeModal('modal-trade-detail');
        if (global.App && global.App.refreshAll) global.App.refreshAll();
        UI.toast('Trade deleted.', 'info');
      }, 'Delete');
    });
    var reviewBtn = qs('#td-open-review');
    if (reviewBtn) reviewBtn.addEventListener('click', function () { UI.closeModal('modal-trade-detail'); openPostTradeReview(t.id); });
    qsa('.td-screens img').forEach(function (img) {
      img.addEventListener('click', function () {
        qs('#img-preview-src').src = img.src;
        qs('#img-preview-title').textContent = img.dataset.slotTitle || 'Screenshot';
        UI.openModal('modal-image-preview');
      });
    });
  }
  function openTradeDetail(id) {
    var t = Storage.getTrade(id);
    if (!t) return;
    var settings = Storage.getSettings();
    qs('#td-title').innerHTML = (t.isDemo ? '<span class="badge badge-info">DEMO</span> ' : '') + 'US30 ' + cap(t.direction) + ' \u2014 ' + UI.formatDate(t.date) + (t.entryTime ? ' ' + t.entryTime : '');
    qs('#td-body').innerHTML = buildTradeDetailHtml(t, settings);
    wireTradeDetailActions(t);
    UI.openModal('modal-trade-detail');
  }

  // ---- Post-Trade Review modal --------------------------------------------------
  function buildPostTradeReviewForm(pr) {
    var html = '<div class="ptr-score-banner"><span>Trade Quality Score</span><span class="ptr-score-value" id="ptr-score-value">' + (pr.qualityScore != null ? pr.qualityScore : '\u2014') + '/100</span></div>';
    html += '<div class="field-grid">';
    CFG.POST_TRADE_YESNO.forEach(function (f) {
      html += '<div class="field"><label>' + f.label + '</label><div class="tri-toggle" data-ptr-yn="' + f.key + '">' +
        '<button type="button" class="tri-btn tri-yes" data-val="true">Yes</button><button type="button" class="tri-btn tri-no" data-val="false">No</button></div></div>';
    });
    html += '</div>';
    CFG.POST_TRADE_TEXT.forEach(function (f) {
      html += '<div class="field field-full"><label>' + f.label + '</label><textarea class="input" rows="2" data-ptr-text="' + f.key + '">' + UI.escapeHtml(pr[f.key] || '') + '</textarea></div>';
    });
    html += '<div class="panel-head panel-head-inset"><h2>Trade Quality (0\u201310 each)</h2></div><div class="ptr-quality-grid">';
    CFG.QUALITY_CATEGORIES.forEach(function (c) {
      var v = (pr.quality && pr.quality[c.key] != null) ? pr.quality[c.key] : 5;
      html += '<div class="ptr-quality-item"><label>' + c.label + ': <span data-ptr-quality-out="' + c.key + '">' + v + '</span></label>' +
        '<input type="range" min="0" max="10" value="' + v + '" class="range" data-ptr-quality="' + c.key + '" /></div>';
    });
    html += '</div><div class="form-footer-actions" style="justify-content:flex-end;padding-top:16px"><button type="button" class="btn btn-primary" id="ptr-save-btn">Save Review</button></div>';
    return html;
  }
  function openPostTradeReview(id) {
    var t = Storage.getTrade(id);
    if (!t) return;
    var pr = JSON.parse(JSON.stringify(t.postTradeReview || Storage.createEmptyTrade().postTradeReview));
    qs('#ptr-body').innerHTML = buildPostTradeReviewForm(pr);
    var body = qs('#ptr-body');
    function syncYn() {
      qsa('[data-ptr-yn]', body).forEach(function (wrap) {
        var v = pr[wrap.dataset.ptrYn];
        wrap.querySelector('.tri-yes').classList.toggle('active', v === true);
        wrap.querySelector('.tri-no').classList.toggle('active', v === false);
      });
    }
    function recomputeScore() {
      var score = Calc.calcTradeQualityScore(pr.quality);
      qs('#ptr-score-value').textContent = (score != null ? score : '\u2014') + '/100';
    }
    qsa('[data-ptr-yn]', body).forEach(function (wrap) {
      var key = wrap.dataset.ptrYn;
      wrap.querySelectorAll('.tri-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var newVal = btn.dataset.val === 'true';
          pr[key] = (pr[key] === newVal) ? null : newVal;
          syncYn();
        });
      });
    });
    qsa('[data-ptr-text]', body).forEach(function (el) { el.addEventListener('input', function () { pr[el.dataset.ptrText] = el.value; }); });
    qsa('[data-ptr-quality]', body).forEach(function (el) {
      el.addEventListener('input', function () {
        pr.quality[el.dataset.ptrQuality] = Number(el.value);
        var out = qs('[data-ptr-quality-out="' + el.dataset.ptrQuality + '"]', body);
        if (out) out.textContent = el.value;
        recomputeScore();
      });
    });
    syncYn(); recomputeScore();
    qs('#ptr-save-btn').addEventListener('click', function () {
      pr.completed = true;
      pr.qualityScore = Calc.calcTradeQualityScore(pr.quality);
      Storage.updateTrade(t.id, { postTradeReview: pr });
      UI.closeModal('modal-post-trade-review');
      if (global.App && global.App.refreshAll) global.App.refreshAll();
      UI.toast('Post-trade review saved.', 'success');
    });
    UI.openModal('modal-post-trade-review');
  }

  // ---- Reusable mini list (Dashboard / Daily Review / Calendar day modal) -------
  function renderMiniList(container, trades, opts) {
    opts = opts || {};
    var settings = Storage.getSettings();
    if (!trades.length) { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i>' + (opts.emptyText || 'No trades.') + '</div>'; return; }
    container.innerHTML = trades.map(function (t) {
      return '<div class="mini-trade-row" data-id="' + t.id + '">' +
        '<span class="mt-date">' + UI.formatDate(t.date) + '</span>' +
        '<span class="mt-setup">' + UI.escapeHtml(setupLabel(t.setup)) + ' \u00B7 ' + sessionLabel(t.session) + '</span>' +
        '<span class="mt-r mono ' + UI.toneClass(t.rMultiple || 0) + '">' + UI.formatR(t.rMultiple) + '</span>' +
        '<span class="mt-pnl mono ' + UI.toneClass(t.pnl || 0) + '">' + (t.pnl != null ? UI.formatCurrency(t.pnl, settings.currency) : '\u2014') + '</span>' +
        '</div>';
    }).join('');
    qsa('.mini-trade-row', container).forEach(function (row) { row.addEventListener('click', function () { openTradeDetail(row.dataset.id); }); });
  }

  function init() {
    initFilters();
    UI.registerPageRefresh('journal', render);
  }

  global.Journal = { init: init, render: render, openTradeDetail: openTradeDetail, openPostTradeReview: openPostTradeReview, renderMiniList: renderMiniList, setupLabel: setupLabel, sessionLabel: sessionLabel };
})(window);
