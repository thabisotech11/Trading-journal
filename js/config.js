/* ==========================================================================
   config.js — single source of truth for enums, checklists and defaults.
   Nothing in here touches localStorage or the DOM; it is pure data so the
   rest of the app (and any future backend) can import/serialize it as-is.
   ========================================================================== */
(function (global) {
  'use strict';

  var STORAGE_PREFIX = 'us30jt_';

  var CURRENCIES = {
    USD: { symbol: '$', code: 'USD' },
    ZAR: { symbol: 'R', code: 'ZAR' },
    EUR: { symbol: '\u20AC', code: 'EUR' },
    GBP: { symbol: '\u00A3', code: 'GBP' }
  };

  var DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'];

  // Session windows are editable in Settings; these are only the defaults.
  // Times are 24h "HH:MM" in the account's local trading-day clock (SAST by default).
  var DEFAULT_SESSIONS = {
    asian: { label: 'Asian', start: '02:00', end: '08:00' },
    london: { label: 'London', start: '09:00', end: '15:30' },
    ny_open: { label: 'New York Open', start: '15:30', end: '17:00' },
    ny_expansion: { label: 'New York Expansion', start: '17:00', end: '18:30' },
    ny_close: { label: 'New York Close', start: '18:30', end: '22:00' }
  };
  var SESSION_ORDER = ['asian', 'london', 'ny_open', 'ny_expansion', 'ny_close'];

  var TIMEFRAMES = ['1M', '5M', '15M', '1H', '4H', 'Daily'];

  var SETUP_TYPES = [
    { key: 'liquidity_sweep', label: 'Liquidity Sweep' },
    { key: 'bos_retest', label: 'BOS + Retest' },
    { key: 'choch_reversal', label: 'CHOCH Reversal' },
    { key: 'order_block_entry', label: 'Order Block Entry' },
    { key: 'fvg_entry', label: 'Fair Value Gap Entry' },
    { key: 'breaker_entry', label: 'Breaker Entry' },
    { key: 'displacement_entry', label: 'Displacement Entry' },
    { key: 'session_hl_sweep', label: 'Session High/Low Sweep' },
    { key: 'pdh_pdl_setup', label: 'Previous Day High/Low Setup' },
    { key: 'pwh_pwl_setup', label: 'Previous Week High/Low Setup' },
    { key: 'custom', label: 'Custom Setup' }
  ];

  var SETUP_GRADES = ['A+', 'A', 'B', 'C', 'D', 'No Grade'];

  // ---- SMC checklist --------------------------------------------------
  var SMC_CHECKLIST = {
    marketStructure: {
      label: 'Market Structure',
      items: [
        { key: 'higherHigh', label: 'Higher High' },
        { key: 'higherLow', label: 'Higher Low' },
        { key: 'lowerHigh', label: 'Lower High' },
        { key: 'lowerLow', label: 'Lower Low' },
        { key: 'bos', label: 'Break of Structure (BOS)' },
        { key: 'choch', label: 'Change of Character (CHOCH)' },
        { key: 'mss', label: 'Market Structure Shift' },
        { key: 'internal', label: 'Internal Structure' },
        { key: 'external', label: 'External Structure' }
      ]
    },
    liquidity: {
      label: 'Liquidity',
      items: [
        { key: 'buySide', label: 'Buy-Side Liquidity' },
        { key: 'sellSide', label: 'Sell-Side Liquidity' },
        { key: 'equalHighs', label: 'Equal Highs' },
        { key: 'equalLows', label: 'Equal Lows' },
        { key: 'pdh', label: 'Previous Day High' },
        { key: 'pdl', label: 'Previous Day Low' },
        { key: 'pwh', label: 'Previous Week High' },
        { key: 'pwl', label: 'Previous Week Low' },
        { key: 'asianHigh', label: 'Asian High' },
        { key: 'asianLow', label: 'Asian Low' },
        { key: 'londonHigh', label: 'London High' },
        { key: 'londonLow', label: 'London Low' },
        { key: 'prevSessionHigh', label: 'Previous Session High' },
        { key: 'prevSessionLow', label: 'Previous Session Low' },
        { key: 'sweep', label: 'Liquidity Sweep' },
        { key: 'stopHunt', label: 'Stop Hunt' }
      ]
    },
    priceDelivery: {
      label: 'Price Delivery',
      items: [
        { key: 'orderBlock', label: 'Order Block' },
        { key: 'fvg', label: 'Fair Value Gap' },
        { key: 'imbalance', label: 'Imbalance' },
        { key: 'breaker', label: 'Breaker Block' },
        { key: 'mitigation', label: 'Mitigation Block' },
        { key: 'premium', label: 'Premium Zone' },
        { key: 'discount', label: 'Discount Zone' },
        { key: 'equilibrium', label: 'Equilibrium' },
        { key: 'displacement', label: 'Displacement' },
        { key: 'rejection', label: 'Rejection' },
        { key: 'retest', label: 'Retest' }
      ]
    }
  };

  var LIQUIDITY_DIRECTIONS = [
    { key: 'buy_side', label: 'Buy-side' },
    { key: 'sell_side', label: 'Sell-side' },
    { key: 'both', label: 'Both' },
    { key: 'unclear', label: 'Unclear' }
  ];

  var LIQUIDITY_OUTCOMES = [
    { key: 'swept_reversed', label: 'Swept and reversed' },
    { key: 'swept_continued', label: 'Swept and continued' },
    { key: 'failed_sweep', label: 'Failed sweep' },
    { key: 'no_sweep', label: 'No sweep' },
    { key: 'unknown', label: 'Unknown' }
  ];

  // ---- Multi-timeframe analysis ---------------------------------------
  // Drives both the Log Trade "Multi-Timeframe" tab and any read-only render.
  var MTF_CONFIG = [
    { key: 'daily', label: 'Daily', fields: [
      { key: 'bias', label: 'Bias', type: 'bias' },
      { key: 'keyLevels', label: 'Key Levels', type: 'text' },
      { key: 'liquidity', label: 'Liquidity', type: 'text' },
      { key: 'majorStructure', label: 'Major Structure', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ]},
    { key: 'h4', label: '4H', fields: [
      { key: 'bias', label: 'Bias', type: 'bias' },
      { key: 'structure', label: 'Structure', type: 'text' },
      { key: 'liquidity', label: 'Liquidity', type: 'text' },
      { key: 'keyZones', label: 'Key Zones', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ]},
    { key: 'h1', label: '1H', fields: [
      { key: 'bias', label: 'Bias', type: 'bias' },
      { key: 'marketStructure', label: 'Market Structure', type: 'text' },
      { key: 'liquidity', label: 'Liquidity', type: 'text' },
      { key: 'poi', label: 'POI', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ]},
    { key: 'm15', label: '15M', fields: [
      { key: 'structure', label: 'Structure', type: 'text' },
      { key: 'liquiditySweep', label: 'Liquidity Sweep', type: 'text' },
      { key: 'confirmation', label: 'Confirmation', type: 'text' },
      { key: 'poi', label: 'POI', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ]},
    { key: 'm5', label: '5M', fields: [
      { key: 'entryModel', label: 'Entry Model', type: 'text' },
      { key: 'confirmation', label: 'Confirmation', type: 'text' },
      { key: 'displacement', label: 'Displacement', type: 'text' },
      { key: 'fvg', label: 'FVG', type: 'text' },
      { key: 'orderBlock', label: 'Order Block', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' }
    ]},
    { key: 'm1', label: '1M', fields: [
      { key: 'trigger', label: 'Trigger', type: 'text' },
      { key: 'entryConfirmation', label: 'Entry Confirmation', type: 'text' },
      { key: 'stopPlacement', label: 'Stop Placement', type: 'text' },
      { key: 'executionNotes', label: 'Execution Notes', type: 'textarea' }
    ]}
  ];
  var BIAS_OPTIONS = ['Bullish', 'Bearish', 'Neutral/Ranging'];

  // ---- Psychology -------------------------------------------------------
  // Before: rated 1-10. Direction says whether a HIGH score is good or bad,
  // used only for the optional "risk factor" tinting in the UI.
  var PSYCHOLOGY_BEFORE = [
    { key: 'emotionalState', label: 'Emotional State', good: 'high' },
    { key: 'confidence', label: 'Confidence', good: 'high' },
    { key: 'patience', label: 'Patience', good: 'high' },
    { key: 'clarity', label: 'Clarity', good: 'high' },
    { key: 'fear', label: 'Fear', good: 'low' },
    { key: 'greed', label: 'Greed', good: 'low' },
    { key: 'fomo', label: 'FOMO', good: 'low' },
    { key: 'revengeTrading', label: 'Revenge Trading', good: 'low' },
    { key: 'boredom', label: 'Boredom', good: 'low' },
    { key: 'overconfidence', label: 'Overconfidence', good: 'low' }
  ];

  // After: yes/no. "good" tells the discipline-score calculator which
  // answer (true/false) counts as disciplined.
  var PSYCHOLOGY_AFTER = [
    { key: 'planned', label: 'Was the trade planned?', good: true },
    { key: 'followedRules', label: 'Did I follow my rules?', good: true },
    { key: 'enteredEarly', label: 'Did I enter early?', good: false },
    { key: 'chasedPrice', label: 'Did I chase price?', good: false },
    { key: 'movedStop', label: 'Did I move my stop?', good: false },
    { key: 'movedTakeProfit', label: 'Did I move my take profit?', good: false },
    { key: 'overRisked', label: 'Did I over-risk?', good: false },
    { key: 'revengeTraded', label: 'Did I revenge trade?', good: false },
    { key: 'exitedEmotionally', label: 'Did I exit emotionally?', good: false },
    { key: 'followedSetupPerfectly', label: 'Did I follow the setup perfectly?', good: true }
  ];

  // ---- Post-trade review -------------------------------------------------
  var POST_TRADE_YESNO = [
    { key: 'setupValid', label: 'Was the setup valid?' },
    { key: 'liquidityCorrect', label: 'Was liquidity correctly identified?' },
    { key: 'structureCorrect', label: 'Was market structure correctly read?' },
    { key: 'entryClean', label: 'Was entry execution clean?' },
    { key: 'stopLogical', label: 'Was stop placement logical?' },
    { key: 'targetLogical', label: 'Was target logical?' },
    { key: 'followedPlan', label: 'Did I follow my plan?' }
  ];
  var POST_TRADE_TEXT = [
    { key: 'whyEnter', label: 'Why did I enter?' },
    { key: 'didWell', label: 'What did I do well?' },
    { key: 'didWrong', label: 'What did I do wrong?' },
    { key: 'repeat', label: 'What should I repeat?' },
    { key: 'stopDoing', label: 'What should I stop doing?' },
    { key: 'lesson', label: 'What is the lesson from this trade?' }
  ];
  var QUALITY_CATEGORIES = [
    { key: 'analysis', label: 'Analysis' },
    { key: 'entry', label: 'Entry' },
    { key: 'riskManagement', label: 'Risk Management' },
    { key: 'execution', label: 'Execution' },
    { key: 'psychology', label: 'Psychology' },
    { key: 'exit', label: 'Exit' }
  ];

  // ---- Pre-trade checklist ------------------------------------------------
  // "auto" items are derived live from other form fields; "manual" items are
  // self-assessment toggles with no other home in the data model.
  var PRE_TRADE_CHECKLIST = [
    { key: 'bias', label: "What is today's market bias?", mode: 'auto' },
    { key: 'liquidityLocation', label: 'Where is liquidity?', mode: 'auto' },
    { key: 'liquidityTarget', label: 'What liquidity am I targeting?', mode: 'auto' },
    { key: 'poi', label: 'What is my POI?', mode: 'auto' },
    { key: 'confirmation', label: 'What confirms the entry?', mode: 'auto' },
    { key: 'invalidation', label: 'Where is invalidation?', mode: 'auto' },
    { key: 'risk', label: 'What is my risk?', mode: 'auto' },
    { key: 'target', label: 'What is my target?', mode: 'auto' },
    { key: 'rrOk', label: 'Is R:R acceptable?', mode: 'auto' },
    { key: 'inSession', label: 'Is this inside my trading session?', mode: 'auto' },
    { key: 'emotionallyStable', label: 'Am I emotionally stable?', mode: 'manual' },
    { key: 'followingPlan', label: 'Am I following my plan?', mode: 'manual' }
  ];

  // ---- Rule Compliance Engine -------------------------------------------
  // type drives auto-detection in calculations.js#evaluateRule; 'custom' rules
  // are always manually marked per trade.
  var DEFAULT_RULES = [
    { id: 'rule_market', text: 'Trade only US30', type: 'marketOnly', active: true },
    { id: 'rule_session', text: 'Trade only during New York', type: 'sessionOnly', param: ['ny_open', 'ny_expansion', 'ny_close'], active: true },
    { id: 'rule_risk', text: 'Risk maximum 1%', type: 'maxRisk', active: true },
    { id: 'rule_rr', text: 'Minimum 2R', type: 'minRR', active: true },
    { id: 'rule_sweep', text: 'Wait for liquidity sweep', type: 'requireSweep', active: true },
    { id: 'rule_confirmation', text: 'Wait for confirmation', type: 'requireConfirmation', active: true },
    { id: 'rule_chase', text: 'Never chase price', type: 'noChasePrice', active: true },
    { id: 'rule_stop', text: 'Never move stop emotionally', type: 'noMovedStop', active: true }
  ];

  var DEFAULT_SETTINGS = {
    startingBalance: 10000,
    currency: 'USD',
    maxRiskPercent: 1,
    maxDailyLossR: 3,
    minRR: 2,
    accountName: 'US30 Prop Account',
    traderName: '',
    theme: 'dark',
    dateFormat: 'YYYY-MM-DD',
    positionSizeUnit: 'lots',
    sessions: DEFAULT_SESSIONS
  };

  var SCREENSHOT_SLOTS = [
    { key: 'htf', label: 'Higher Timeframe Analysis' },
    { key: 'entrySetup', label: 'Entry Setup' },
    { key: 'entryExecution', label: 'Entry Execution' },
    { key: 'exit', label: 'Exit' },
    { key: 'postTrade', label: 'Post-Trade Review' }
  ];

  global.CFG = {
    STORAGE_PREFIX: STORAGE_PREFIX,
    CURRENCIES: CURRENCIES,
    DATE_FORMATS: DATE_FORMATS,
    DEFAULT_SESSIONS: DEFAULT_SESSIONS,
    SESSION_ORDER: SESSION_ORDER,
    TIMEFRAMES: TIMEFRAMES,
    SETUP_TYPES: SETUP_TYPES,
    SETUP_GRADES: SETUP_GRADES,
    SMC_CHECKLIST: SMC_CHECKLIST,
    LIQUIDITY_DIRECTIONS: LIQUIDITY_DIRECTIONS,
    LIQUIDITY_OUTCOMES: LIQUIDITY_OUTCOMES,
    MTF_CONFIG: MTF_CONFIG,
    BIAS_OPTIONS: BIAS_OPTIONS,
    PSYCHOLOGY_BEFORE: PSYCHOLOGY_BEFORE,
    PSYCHOLOGY_AFTER: PSYCHOLOGY_AFTER,
    POST_TRADE_YESNO: POST_TRADE_YESNO,
    POST_TRADE_TEXT: POST_TRADE_TEXT,
    QUALITY_CATEGORIES: QUALITY_CATEGORIES,
    PRE_TRADE_CHECKLIST: PRE_TRADE_CHECKLIST,
    DEFAULT_RULES: DEFAULT_RULES,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    SCREENSHOT_SLOTS: SCREENSHOT_SLOTS
  };
})(window);
