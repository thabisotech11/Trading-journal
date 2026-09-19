/* ==========================================================================
   calendar.js — monthly trading calendar. Grid always renders complete
   Monday-start weeks (5 or 6 rows depending on the month), with faded
   filler cells for the adjacent months.
   ========================================================================== */
(function (global) {
  'use strict';
  var Calc = global.Calc, Storage = global.Storage, UI = global.UI;
  var qs = UI.qs, qsa = UI.qsa;
  var state = { year: 0, month: 0 };

  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function mondayIndex(jsDay) { return (jsDay + 6) % 7; }

  function render() {
    var trades = Storage.getTrades();
    var settings = Storage.getSettings();
    var y = state.year, m = state.month;
    qs('#cal-month-label').textContent = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    var byDate = Calc.groupBy(trades.filter(function (t) { return t.status === 'closed'; }), function (t) { return t.date; });
    var firstDay = new Date(y, m, 1);
    var startOffset = mondayIndex(firstDay.getDay());
    var totalDays = daysInMonth(y, m);
    var prevMonthDays = daysInMonth(y, m - 1);
    var todayStr = UI.todayIso();

    var cells = [];
    for (var i = 0; i < startOffset; i++) {
      cells.push({ dayNum: prevMonthDays - startOffset + 1 + i, outOfMonth: true, dateStr: null });
    }
    for (var d = 1; d <= totalDays; d++) {
      cells.push({ dayNum: d, outOfMonth: false, dateStr: y + '-' + UI.pad(m + 1) + '-' + UI.pad(d) });
    }
    var trailCount = 1;
    while (cells.length % 7 !== 0) { cells.push({ dayNum: trailCount++, outOfMonth: true, dateStr: null }); }

    qs('#calendar-grid').innerHTML = cells.map(function (c) {
      if (c.outOfMonth) return '<div class="cal-day out-of-month"><span class="cal-day-num">' + c.dayNum + '</span></div>';
      var dayTrades = byDate[c.dateStr] || [];
      var pnl = dayTrades.reduce(function (s, t) { return s + (t.pnl || 0); }, 0);
      var rSum = dayTrades.reduce(function (s, t) { return s + (typeof t.rMultiple === 'number' ? t.rMultiple : 0); }, 0);
      var wins = dayTrades.filter(function (t) { return t.result === 'win'; }).length;
      var losses = dayTrades.filter(function (t) { return t.result === 'loss'; }).length;
      var cls = 'cal-day' + (c.dateStr === todayStr ? ' is-today' : '');
      if (dayTrades.length) cls += ' has-trades' + (pnl > 0 ? ' day-profit' : pnl < 0 ? ' day-loss' : '');
      var body = '<span class="cal-day-num">' + c.dayNum + '</span>';
      if (dayTrades.length) {
        body += '<span class="cal-day-pnl ' + UI.toneClass(pnl) + '">' + UI.formatCurrency(pnl, settings.currency) + '</span>' +
          '<span class="cal-day-meta">' + dayTrades.length + ' trade' + (dayTrades.length > 1 ? 's' : '') + ' \u00B7 ' + wins + 'W/' + losses + 'L \u00B7 ' + UI.formatR(rSum) + '</span>';
      }
      return '<div class="' + cls + '" data-date="' + c.dateStr + '">' + body + '</div>';
    }).join('');

    qsa('.cal-day.has-trades', qs('#calendar-grid')).forEach(function (cell) {
      cell.addEventListener('click', function () { openDayDetail(cell.dataset.date); });
    });
  }

  function openDayDetail(dateStr) {
    var trades = Calc.sortChrono(Storage.getTrades().filter(function (t) { return t.date === dateStr && t.status === 'closed'; }));
    var settings = Storage.getSettings();
    var pnl = trades.reduce(function (s, t) { return s + (t.pnl || 0); }, 0);
    var rSum = trades.reduce(function (s, t) { return s + (typeof t.rMultiple === 'number' ? t.rMultiple : 0); }, 0);
    qs('#dd-title').textContent = UI.formatDate(dateStr);
    qs('#dd-body').innerHTML = '<div class="readout-row" style="margin-bottom:16px">' +
      '<div class="readout"><span class="readout-label">Net P&amp;L</span><span class="readout-value ' + UI.toneClass(pnl) + '">' + UI.formatCurrency(pnl, settings.currency) + '</span></div>' +
      '<div class="readout"><span class="readout-label">Total R</span><span class="readout-value">' + UI.formatR(rSum) + '</span></div>' +
      '<div class="readout"><span class="readout-label">Trades</span><span class="readout-value">' + trades.length + '</span></div>' +
      '</div><div id="dd-trade-list"></div>';
    global.Journal.renderMiniList(qs('#dd-trade-list'), trades, { emptyText: 'No trades.' });
    UI.openModal('modal-day-detail');
  }

  function prevMonth() { state.month--; if (state.month < 0) { state.month = 11; state.year--; } render(); }
  function nextMonth() { state.month++; if (state.month > 11) { state.month = 0; state.year++; } render(); }

  function init() {
    var now = new Date();
    state.year = now.getFullYear(); state.month = now.getMonth();
    qs('#cal-prev').addEventListener('click', prevMonth);
    qs('#cal-next').addEventListener('click', nextMonth);
    UI.registerPageRefresh('calendar', render);
  }

  global.CalendarPage = { init: init, render: render };
})(window);
