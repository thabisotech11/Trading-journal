/* ==========================================================================
   rules.js — CRUD for the trading rules list. Auto-detectable rule types
   (risk%, R:R, session, SMC/psychology flags) are labeled "Auto"; anything
   the trader adds here is always type 'custom', assessed manually per trade.
   ========================================================================== */
(function (global) {
  'use strict';
  var Storage = global.Storage, UI = global.UI;
  var qs = UI.qs, qsa = UI.qsa;

  var TYPE_LABELS = {
    marketOnly: 'Auto \u00B7 Market', sessionOnly: 'Auto \u00B7 Session', maxRisk: 'Auto \u00B7 Risk %',
    minRR: 'Auto \u00B7 R:R', requireSweep: 'Auto \u00B7 SMC', requireConfirmation: 'Auto \u00B7 SMC',
    noChasePrice: 'Auto \u00B7 Psychology', noMovedStop: 'Auto \u00B7 Psychology', noRevengeTrade: 'Auto \u00B7 Psychology'
  };
  function typeLabel(type) { return TYPE_LABELS[type] || 'Manual'; }

  function render() {
    var rules = Storage.getRules();
    var container = qs('#rules-list');
    if (!rules.length) { container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-scale-balanced"></i>No rules yet. Add your first one above.</div>'; return; }
    container.innerHTML = rules.map(function (r) {
      return '<div class="rule-item" data-id="' + r.id + '">' +
        '<span class="rule-text">' + UI.escapeHtml(r.text) + '</span>' +
        '<span class="rule-type-tag">' + typeLabel(r.type) + '</span>' +
        '<button type="button" class="rule-toggle ' + (r.active ? 'on' : '') + '" title="' + (r.active ? 'Active \u2014 click to deactivate' : 'Inactive \u2014 click to activate') + '" data-action="toggle"><i class="fa-solid fa-' + (r.active ? 'toggle-on' : 'toggle-off') + '"></i></button>' +
        '<button type="button" class="rule-remove" title="Delete rule" data-action="remove"><i class="fa-solid fa-trash"></i></button>' +
        '</div>';
    }).join('');
    qsa('.rule-item', container).forEach(function (row) {
      var id = row.dataset.id;
      row.querySelector('[data-action="toggle"]').addEventListener('click', function () {
        var rules2 = Storage.getRules();
        var rule = rules2.filter(function (r) { return r.id === id; })[0];
        if (rule) { rule.active = !rule.active; Storage.saveRules(rules2); render(); }
      });
      row.querySelector('[data-action="remove"]').addEventListener('click', function () {
        UI.showConfirm('Delete this rule?', 'Trades will no longer be checked against it.', function () {
          Storage.saveRules(Storage.getRules().filter(function (r) { return r.id !== id; }));
          render();
          UI.toast('Rule deleted.', 'info');
        }, 'Delete');
      });
    });
  }

  function init() {
    qs('#add-rule-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = qs('#new-rule-text');
      var text = input.value.trim();
      if (!text) return;
      var rules = Storage.getRules();
      rules.push({ id: Storage.newId('rule'), text: text, type: 'custom', active: true });
      Storage.saveRules(rules);
      input.value = '';
      render();
      UI.toast('Rule added.', 'success');
    });
    UI.registerPageRefresh('rules', render);
  }

  global.Rules = { init: init, render: render };
})(window);
