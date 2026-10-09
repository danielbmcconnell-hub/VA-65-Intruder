/* Additive POW communication activities. All playable messages and decisions
   are reconstructed fiction, never quotations from the historical prisoners. */
(function (root) {
  'use strict';
  const P = root.POW = root.POW || {};
  const RECORDS = [
    { id: 'denton', name: 'Jeremiah Denton', service: 'U.S. Navy', photo: 'denton', note: 'Naval aviator captured in July 1965. His May 1966 televised interview belongs to an earlier historical flashback, not this 1967 chapter.' },
    { id: 'stockdale', name: 'James Stockdale', service: 'U.S. Navy', photo: 'stockdale', note: 'Naval aviator captured in September 1965; a senior leader of the American POW resistance. His leadership and Stoic study provide historical context, not a script for judging prisoners.' },
    { id: 'coker', name: 'George Thomas Coker', service: 'U.S. Navy', photo: 'coker', note: 'Coker and U.S. Air Force Captain George G. McKnight escaped on 12 October 1967 and were recaptured after traveling downstream. Successful game escapes are alternate history.' },
    { id: 'mcknight', name: 'George G. McKnight', service: 'U.S. Air Force', note: 'An Air Force captain in the October 1967 Coker–McKnight escape. He was also one of the Alcatraz Eleven; he was not a Navy aviator.' },
    { id: 'johnson', name: 'Sam Johnson', service: 'U.S. Air Force', note: 'His donated POW materials and Smithsonian account document prolonged isolation and restrictive Alcatraz conditions.' },
    { id: 'jenkins', name: 'Harry Jenkins', service: 'U.S. Navy' },
    { id: 'mulligan', name: 'James Mulligan', service: 'U.S. Navy' },
    { id: 'rutledge', name: 'Howard Rutledge', service: 'U.S. Navy' },
    { id: 'shumaker', name: 'Robert Shumaker', service: 'U.S. Navy' },
    { id: 'storz', name: 'Ronald Storz', service: 'U.S. Air Force' },
    { id: 'tanner', name: 'Nels Tanner', service: 'U.S. Navy' }
  ];
  const COURSE = [
    { word: 'HOPE', kind: 'support', text: 'Reconstructed message: another isolated prisoner acknowledges your presence. Receiving support is part of survival.' },
    { word: 'DENTON', kind: 'identity', id: 'denton', text: 'Reconstructed identification exchange: the network passes Jeremiah Denton’s name. This does not establish his cell’s exact location.' },
    { word: 'REST', kind: 'support', text: 'Reconstructed message: rest when possible. A need for recovery is not personal failure.' },
    { word: 'STOCKDALE', kind: 'identity', id: 'stockdale', text: 'Reconstructed identification exchange: the network passes James Stockdale’s name and introduces the senior leadership context.' },
    { word: 'UNITY', kind: 'guidance', id: 'unity', text: 'Reconstructed message: preserve mutual support and the chain of command. Protecting one another matters more than an individual display of toughness.' },
    { word: 'REPORT', kind: 'guidance', id: 'report', text: 'Reconstructed message: when safe, reconnect after an interview and distinguish what you observed from what you only suspect.' },
    { word: 'WATCH', kind: 'clue', id: 'observe', text: 'Reconstructed clue: observe the corridor rather than acting on rumor. The playable guard routine is fictional.' },
    { word: 'CHANGEOVER', kind: 'clue', id: 'changeover', text: 'Reconstructed clue: during the fictional corridor changeover, a guard walks to the far door and turns his back before returning. Observe the timing yourself; this does not open a door or grant escape.' },
    ...RECORDS.filter(person => !['denton', 'stockdale'].includes(person.id)).map(person => ({ word: person.id.toUpperCase(), kind: 'identity', id: person.id, text: 'Reconstructed identification exchange: the network passes ' + person.name + '’s name. No exact neighboring-cell assignment is claimed.' })),
    { word: 'KEEP TOGETHER', kind: 'guidance', id: 'support', text: 'Reconstructed phrase: keep contact where possible. C and K use the same tap-code square; spaces do not change the letters you count.' },
    { word: 'REST THEN OBSERVE', kind: 'clue', id: 'practice', text: 'Reconstructed phrase: recover, then compare the corridor pattern on different days. A plan needs observation and actual movement.' }
  ];
  const SUPPORT = [
    { word: 'STAY IN TOUCH', kind: 'support', text: 'Reconstructed phrase: maintain contact when it is safe. An interruption does not erase established relationships.' },
    { word: 'TAKE TIME TO REST', kind: 'support', text: 'Reconstructed phrase: recovery gives you another chance to think, remember and observe.' },
    { word: 'WE REMEMBER HOME', kind: 'support', text: 'Reconstructed phrase: remembered family and familiar places can provide a private anchor.' }
  ];
  const SCOUT = ['Trustworthy', 'Loyal', 'Helpful', 'Friendly', 'Courteous', 'Kind', 'Obedient', 'Cheerful', 'Thrifty', 'Brave', 'Clean', 'Reverent'];
  const OATH = ['On my honor I will do my best', 'To do my duty to God and my country and to obey the Scout Law', 'To help other people at all times', 'To keep myself physically strong, mentally awake, and morally straight'];
  const FAMILY = ['A familiar doorway', 'A welcoming voice', 'A shared meal', 'A quiet farewell', 'A remembered journey', 'A return home'];
  const REFLECTION = ['Notice what is present', 'Separate fact from fear', 'Choose one small action', 'Allow time for recovery', 'Remember a source of purpose', 'Ask for help when possible'];
  const PRINCIPLES = [
    { id: 'unity', label: 'Unity and chain of command', detail: 'Keep an appropriate connection to senior leadership and fellow prisoners; do not confuse isolation with abandonment.' },
    { id: 'recover', label: 'Recover after coercion', detail: 'Re-establish contact and begin again. The simulation does not grade anyone’s courage or the effects of coercion.' },
    { id: 'discipline', label: 'One manageable action', detail: 'A private memory project, rest, or one careful observation can be a useful next step.' }
  ];
  // Conservative paraphrase only. US is one combined principle; there is no
  // invented separate "S = silence" rule. Exact first-person wording remains
  // subject to the historical-source audit, and is not represented as a quote.
  const BACK_US = [
    { symbol: 'B', id: 'bow', label: 'Public bowing', meaning: 'Avoid a public gesture of submission used for propaganda.' },
    { symbol: 'A', id: 'air', label: 'On-air propaganda', meaning: 'Avoid participation in propaganda broadcasts.' },
    { symbol: 'C', id: 'crimes', label: 'Claimed crimes', meaning: 'Avoid a coerced admission of alleged crimes.' },
    { symbol: 'K', id: 'kiss', label: 'Farewell gestures', meaning: 'Avoid a staged friendly farewell gesture toward captors.' },
    { symbol: 'US', id: 'unity', label: 'Unity over self', meaning: 'Preserve solidarity and mutual support above individual display.' }
  ];
  const SCENARIOS = {
    reconnect: { title: 'After a difficult interview', text: 'You are tired and uncertain. The wall network offers support. Choose a next step; each response protects a different need.', choices: [
      { id: 'report', label: 'Briefly reconnect with the senior network', text: 'You distinguish observed facts from speculation. A trusted connection helps preserve the chain of command.', principle: 'unity' },
      { id: 'rest', label: 'Ask the network for time to recover', text: 'You communicate a need for rest and plan to reconnect afterward. Recovery preserves dignity and is not a failure of solidarity.', principle: 'recover' },
      { id: 'anchor', label: 'Use a private anchor, then reconnect', text: 'You collect your thoughts before a brief check-in. Mental discipline supports one manageable next step.', principle: 'discipline' }
    ] },
    rumor: { title: 'A possible guard change', text: 'An uncertain message suggests a change in the corridor. Nobody knows whether the pattern will last. Choose how to handle the information.', choices: [
      { id: 'observe', label: 'Observe before sharing a firm conclusion', text: 'You mark the report as uncertain and plan a direct observation. The clue is useful only if it matches the actual guard routine.', principle: 'discipline' },
      { id: 'share', label: 'Share it explicitly as unconfirmed', text: 'You pass the uncertainty as well as the information. Fellow prisoners can decide how to protect one another.', principle: 'unity' },
      { id: 'defer', label: 'Defer the risk while you recover', text: 'You conserve your condition and ask the network to retain the clue. The opportunity remains available after rest.', principle: 'recover' }
    ] },
    mutual: { title: 'Another prisoner needs a pause', text: 'A contact misses part of a message. This is a communication problem, not a test of anyone’s character.', choices: [
      { id: 'short', label: 'Offer a shorter message and repeat', text: 'You shorten the exchange and preserve contact. Progress can be patient and shared.', principle: 'unity' },
      { id: 'quiet', label: 'Agree on a quiet interval', text: 'You reduce the immediate burden and retain a plan to reconnect. Rest and mutual support can coexist.', principle: 'recover' },
      { id: 'clear', label: 'Review the grid one letter at a time', text: 'You separate row and column counts and build a manageable practice routine.', principle: 'discipline' }
    ] }
  };
  const normalize = text => P.TapCode && P.TapCode.normalize ? P.TapCode.normalize(text) : String(text || '').toUpperCase().replace(/K/g, 'C').replace(/[^A-Z]/g, '');
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const copy = value => JSON.parse(JSON.stringify(value));
  function initial() {
    return { version: 1, cursor: 0, anonymousReceived: 0, decoded: [], known: [], sent: [], decisions: {}, guidance: {}, objectives: {}, clues: {}, anchors: {}, daily: {}, interviewCount: 0, activities: {}, backus: { selected: null, matches: [] }, feedback: 'Listen at the wall to establish contact. Identities emerge through decoded messages.', anchor: null };
  }
  function state(game) {
    if (!game || !game.pow) return null;
    // Deliberately do not call Captivity.state: its optional integration hook
    // may itself ask for this module’s state while initializing a save.
    const c = game.pow.captivity = game.pow.captivity || {};
    if (!c.solidarity || typeof c.solidarity !== 'object') c.solidarity = initial();
    const n = c.solidarity, defaults = initial();
    for (const key of Object.keys(defaults)) if (n[key] === undefined || n[key] === null && defaults[key] !== null) n[key] = copy(defaults[key]);
    n.cursor = clamp(Number.isFinite(n.cursor) ? Math.floor(n.cursor) : 0, 0, 100000);
    n.anonymousReceived = clamp(Number.isFinite(n.anonymousReceived) ? Math.floor(n.anonymousReceived) : 0, 0, 100000);
    for (const key of ['decoded', 'known', 'sent']) if (!Array.isArray(n[key])) n[key] = [];
    for (const key of ['decisions', 'guidance', 'objectives', 'clues', 'anchors', 'daily', 'activities']) if (!n[key] || typeof n[key] !== 'object' || Array.isArray(n[key])) n[key] = {};
    n.known = Array.from(new Set(n.known.filter(id => RECORDS.some(person => person.id === id))));
    for (const [id, decision] of Object.entries(n.decisions)) if (!SCENARIOS[id] || !decision || !SCENARIOS[id].choices.some(choice => choice.id === decision.choice)) delete n.decisions[id];
    if (!n.backus || typeof n.backus !== 'object') n.backus = { selected: null, matches: [] };
    if (!Array.isArray(n.backus.matches)) n.backus.matches = [];
    n.backus.matches = Array.from(new Set(n.backus.matches.filter(id => BACK_US.some(item => item.id === id))));
    return n;
  }
  function available(game) {
    if (!game || !game.pow || !game.pow.captivity) return false;
    const c = game.pow.captivity;
    const captureYear = Number.isFinite(c.captureYear) ? c.captureYear : 1967;
    const elapsedDays = Math.max(0, (game.pow.day || 1) - (c.captureDay || 1));
    const year = captureYear + Math.floor(elapsedDays / 365);
    if (year < 1967 || year > 1969) return false;
    if (c.alcatrazTransferred === true) return true;
    // Approximate calendar for the existing accelerated simulation. The
    // historical escape starts 12 October: sixteen elapsed days safely place
    // its later separated-cells chapter in late October, without choosing the
    // unresolved transfer day. Earlier mission calendars need the same era.
    return year !== 1967 || elapsedDays >= (1967 - captureYear) * 365 + 16;
  }
  function message(game) {
    const n = state(game);
    if (!n) return copy(COURSE[0]);
    if (!available(game)) return { word: ['HOPE', 'REST', 'STEADY'][n.anonymousReceived % 3], kind: 'anonymous', text: 'Reconstructed anonymous encouragement. The named Alcatraz network belongs to the later October 1967–1969 historical context, not an earlier captivity date.' };
    return copy(n.cursor < COURSE.length ? COURSE[n.cursor] : SUPPORT[(n.cursor - COURSE.length) % SUPPORT.length]);
  }
  function save(game) { if (P.save) P.save(game); }
  function notify(game, text, refresh) {
    const n = state(game); if (!n) return;
    n.feedback = text; game.pow.captivity.feedback = text;
    if (P.notify) P.notify(game, text);
    if (refresh && P.Captivity && P.Captivity.open) P.Captivity.open(game, 'network');
  }
  function gain(game, activity, values) {
    const n = state(game), day = game.pow.day || 1;
    if (n.daily[activity] === day) return false;
    n.daily[activity] = day;
    const stats = game.pow.stats = game.pow.stats || {};
    for (const [key, amount] of Object.entries(values)) stats[key] = clamp((Number.isFinite(stats[key]) ? stats[key] : 60) + amount, 0, 100);
    return true;
  }
  function received(game, word) {
    const n = state(game); if (!n) return false;
    const incoming = message(game);
    if (!normalize(word) || normalize(word) !== normalize(incoming.word)) return false;
    n.decoded.push({ cursor: n.cursor, day: game.pow.day || 1, word: incoming.word, kind: incoming.kind, id: incoming.id || null, text: incoming.text });
    if (n.decoded.length > 80) n.decoded.shift();
    if (incoming.kind === 'identity' && !n.known.includes(incoming.id)) n.known.push(incoming.id);
    if (incoming.kind === 'guidance') n.guidance[incoming.id] = true;
    if (incoming.kind === 'clue') n.clues[incoming.id] = true;
    if (incoming.kind === 'anonymous') n.anonymousReceived++; else n.cursor++;
    n.objectives.contact = true;
    if (n.known.includes('denton') && n.known.includes('stockdale')) n.objectives.leadership = true;
    if (n.known.length === RECORDS.length) n.objectives.eleven = true;
    if (n.clues.changeover) {
      game.pow.flags = game.pow.flags || {};
      game.pow.flags.networkGuardClue = true;
    }
    notify(game, incoming.text, false); save(game); return true;
  }
  function sent(game, word) {
    const n = state(game); if (!n || !normalize(word)) return false;
    n.sent.push({ day: game.pow.day || 1, word: normalize(word) });
    if (n.sent.length > 40) n.sent.shift();
    n.objectives.reply = true; save(game); return true;
  }
  function decide(game, scenario, choice) {
    const n = state(game), activity = SCENARIOS[scenario];
    if (!n || !activity || !n.objectives.contact) return false;
    if (scenario === 'rumor' && !n.clues.observe || scenario === 'mutual' && !n.objectives.reply) return false;
    const option = activity.choices.find(value => value.id === choice); if (!option) return false;
    n.decisions[scenario] = { choice, principle: option.principle, day: game.pow.day || 1 };
    n.guidance[option.principle] = true; n.objectives.thoughtfulResponse = true;
    gain(game, 'decision-' + scenario, { morale: 1, resilience: 1 });
    notify(game, option.text + ' This is reconstructed gameplay, not a recorded conversation or a courage score.', true);
    save(game); return true;
  }
  function backusSelect(game, symbol) {
    const n = state(game);
    if (!n || !n.objectives.leadership || !BACK_US.some(item => item.symbol === symbol)) return false;
    n.backus.selected = symbol;
    notify(game, 'Choose the meaning associated with ' + symbol + '. This is a historical learning exercise, not a test of behavior under coercion.', true);
    return true;
  }
  function backusMatch(game, id) {
    const n = state(game), pair = BACK_US.find(item => item.id === id);
    if (!n || !pair || !n.objectives.leadership || !n.backus.selected) return false;
    if (pair.symbol !== n.backus.selected) {
      notify(game, 'That pairing differs from the reference paraphrase. Review it and try again; condition and captivity progress remain unchanged.', true);
      return false;
    }
    if (!n.backus.matches.includes(id)) n.backus.matches.push(id);
    n.backus.selected = null;
    if (n.backus.matches.length === BACK_US.length) {
      n.objectives.backus = true;
      gain(game, 'backus', { memory: 1, resilience: 1 });
    }
    notify(game, 'Reference pairing remembered: ' + pair.symbol + ' — ' + pair.label + '. Coercion and forced compliance never become a personal failure score.', true);
    save(game); return true;
  }
  function afterInterview(game, choice) {
    const n = state(game); if (!n) return;
    n.interviewCount++; n.objectives.recovery = true;
    n.lastInterview = { day: game.pow.day || 1, choice: String(choice || 'pause') };
    // The same recovery pathway remains open after every choice.
    save(game);
  }
  function afterActivity(game, activity) {
    const n = state(game); if (!n || !activity) return;
    n.activities[String(activity)] = (n.activities[String(activity)] || 0) + 1;
    if (['car', 'architecture', 'city', 'memory', 'exercise'].includes(activity)) n.objectives.practice = true;
  }
  function startAnchor(game, kind) {
    const n = state(game); if (!n || !['scout', 'oath', 'family', 'reflection'].includes(kind)) return false;
    const tokens = kind === 'scout' ? SCOUT : kind === 'oath' ? OATH : kind === 'family' ? FAMILY : REFLECTION;
    const round = (n.anchors[kind] || 0) + 1, hard = game.pow.difficulty === 'hard';
    const length = Math.min(tokens.length, 3 + round + (hard ? 1 : 0));
    n.anchor = { kind, round, tokens: tokens.slice(), targets: Array.from({ length }, (_, i) => i), entered: [], phase: 'show', remaining: game.pow.intensity === 'reduced' ? 8 : hard ? 5 : 7 };
    notify(game, kind === 'scout' ? 'Recall the Scout Law’s traditional order. This optional personal code is not a statement by a POW or a judgment of anyone’s worth.' : kind === 'oath' ? 'Recall the four traditional Scout Oath clauses. This is a Scout text, not an attributed POW quotation. Its faith language is optional; belief is never required for progression.' : kind === 'family' ? 'Imagine a familiar reunion using these cues, then recall their sequence. No private family details are collected.' : 'Optional reflection: observe, separate facts from fear, act gently and allow recovery. It can be secular, prayerful, or skipped.', true);
    save(game); return true;
  }
  function anchorChoose(game, index) {
    const n = state(game), a = n && n.anchor;
    if (!a || a.phase !== 'answer' || !Number.isInteger(index) || index < 0 || index >= a.tokens.length) return false;
    if (index !== a.targets[a.entered.length]) {
      a.entered = [];
      notify(game, 'The sequence differed. Try again or replay it; your condition and established progress are unchanged.', true);
      return false;
    }
    a.entered.push(index);
    if (a.entered.length === a.targets.length) {
      n.anchors[a.kind] = a.round; n.objectives.anchor = true;
      gain(game, 'anchor-' + a.kind, a.kind === 'family' ? { hope: 2, memory: 1 } : ['scout', 'oath'].includes(a.kind) ? { morale: 1, memory: 2 } : { resilience: 2, morale: 1 });
      n.anchor = null;
      notify(game, 'The remembered sequence is complete. Meaning comes from a personal anchor and practice; resting or skipping an activity is equally valid.', true);
    } else notify(game, a.entered.length + ' of ' + a.targets.length + ' cues recalled.', true);
    save(game); return true;
  }
  function step(game, dt) {
    const n = state(game), a = n && n.anchor;
    if (!a || a.phase !== 'show' || !(dt > 0)) return;
    a.remaining -= Math.min(1, dt);
    if (a.remaining <= 0) {
      a.remaining = 0; a.phase = 'answer';
      notify(game, 'Recall the cues in order. Take as much time as you need; this is not a reflex challenge.', !!(game.pow.captivity.open && game.pow.captivity.tab === 'network'));
    }
  }
  function ready(game) {
    const n = state(game);
    return !!(n && n.objectives.contact && n.objectives.reply && n.objectives.thoughtfulResponse && n.objectives.practice && n.clues.changeover);
  }
  function escapeClue(game) {
    const n = state(game);
    return n && n.clues.changeover ? 'Fictional corridor changeover: observe the far-door stop and turn before preparing a physical route. The clue never opens a door or guarantees escape.' : null;
  }
  function node(tag, text, cls) { const e = root.document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function para(parent, text, cls) { const e = node('p', text, cls); parent.appendChild(e); return e; }
  function row(parent) { const e = node('div', undefined, 'pow-row'); parent.appendChild(e); return e; }
  function button(parent, label, fn, data, disabled) {
    const e = node('button', label); e.type = 'button'; e.disabled = !!disabled;
    if (data) for (const [key, value] of Object.entries(data)) e.setAttribute('data-' + key, String(value));
    e.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); fn(); }); parent.appendChild(e); return e;
  }
  function render(game, parent) {
    if (!root.document || !parent) return;
    const n = state(game); if (!n) return;
    const panel = node('section'); panel.setAttribute('data-pow-network', '1'); parent.appendChild(panel);
    panel.appendChild(node('h3', 'Separated cells · prisoner communication network'));
    para(panel, 'Historical context: the Alcatraz Eleven were isolated beginning in late October 1967. The network below is a schematic record of gradually learned identities, not a verified cell plan or permission to socialize freely. Messages and dialogue are reconstructed fiction.', 'pow-dim');
    if (!available(game)) para(panel, 'For this simulated date, contact remains anonymous. Named historical exchanges become available only in the later Alcatraz era. Previously decoded names remain historical memories, not claims about current neighbors.', 'pow-dim');
    para(panel, 'Contact ' + (n.objectives.contact ? 'established' : 'not established') + ' · identities learned ' + n.known.length + '/11 · decoded exchanges ' + n.cursor + ' · replies ' + n.sent.length);
    const controls = row(panel);
    button(controls, 'Listen and decode the next wall message', () => { if (P.Captivity && P.Captivity.open) P.Captivity.open(game, 'tap'); }, { 'network-listen': '1' });
    if (root.POWPhotos && root.POWPhotos.open) button(controls, 'Historical reference photographs', () => root.POWPhotos.open(n.known.includes('denton') ? 'denton' : 'coker'), { 'network-history': '1' });
    const journal = node('div'); journal.setAttribute('data-network-journal', '1'); panel.appendChild(journal);
    journal.appendChild(node('h3', 'Identities remembered through communication'));
    for (const person of RECORDS) {
      const learned = n.known.includes(person.id), item = node('article'); item.setAttribute('data-network-person', person.id); journal.appendChild(item);
      para(item, learned ? person.name + ' · ' + person.service : 'An identity not yet decoded', learned ? '' : 'pow-dim');
      if (learned && person.note) para(item, person.note, 'pow-dim');
      if (learned && person.photo && root.POWPhotos && root.POWPhotos.open) button(row(item), 'View ' + person.name + ' photograph', () => root.POWPhotos.open(person.photo), { 'network-photo': person.id });
    }
    if (n.decoded.length) {
      const details = node('details'), summary = node('summary', 'Decoded reconstructed message journal'); details.appendChild(summary); journal.appendChild(details);
      for (const entry of n.decoded.slice(-12)) para(details, 'Day ' + entry.day + ' · ' + entry.word + ' · ' + entry.text);
    }
    if (n.objectives.leadership) {
      panel.appendChild(node('h3', 'Leadership, BACK US and mental discipline'));
      para(panel, 'Stockdale’s BACK US guidance belongs to resistance leadership. The following conservative, commonly reported paraphrase needs review against first-person wording; it is not a quotation. The historical references document the verification limits. US is the combined principle “unity over self”; no separate S rule is invented.', 'pow-dim');
      const symbols = row(panel);
      for (const item of BACK_US) button(symbols, item.symbol + (n.backus.matches.includes(item.id) ? ' ✓' : ''), () => backusSelect(game, item.symbol), { 'backus-symbol': item.symbol });
      const meanings = row(panel);
      for (const item of BACK_US.slice().reverse()) button(meanings, item.label, () => backusMatch(game, item.id), { 'backus-meaning': item.id }, !n.backus.selected);
      para(panel, 'Read the paraphrase: ' + BACK_US.map(item => item.symbol + ' — ' + item.meaning).join(' · '), 'pow-dim');
      para(panel, n.backus.matches.length + '/5 reference pairings remembered. A survivor’s behavior under pressure is never graded by this exercise.', 'pow-dim');
      for (const principle of PRINCIPLES) para(panel, principle.label + ': ' + principle.detail, 'pow-dim');
    }
    for (const [id, scenario] of Object.entries(SCENARIOS)) {
      if (!n.objectives.contact || id === 'rumor' && !n.clues.observe || id === 'mutual' && !n.objectives.reply) continue;
      panel.appendChild(node('h3', scenario.title)); para(panel, scenario.text);
      const choices = row(panel); for (const choice of scenario.choices) button(choices, choice.label, () => decide(game, id, choice.id), { 'network-decision': id + ':' + choice.id });
      if (n.decisions[id]) para(panel, 'Your recorded approach: ' + scenario.choices.find(choice => choice.id === n.decisions[id].choice).label + '. You may reconsider without penalty.', 'pow-dim');
    }
    panel.appendChild(node('h3', 'Optional remembered anchors'));
    para(panel, 'Recall a family reunion, the Scout Oath and Law, or a private reflection sequence. Optional prayer can accompany reflection. These are private supports and memory activities, not requirements to hold a particular belief.');
    para(panel, 'Scout Oath context: do your best in duty, help others, and care for body, mind and character. The traditional Law has twelve traits. This describes the Scout code, not an attributed POW quotation.', 'pow-dim');
    const anchors = row(panel);
    for (const [id, label] of [['family', 'Remember a family reunion'], ['scout', 'Recall the Scout Law'], ['oath', 'Recall the Scout Oath'], ['reflection', 'Quiet reflection / optional prayer']]) button(anchors, label, () => startAnchor(game, id), { 'network-anchor-start': id });
    const a = n.anchor;
    if (a) {
      const activity = node('div'); activity.setAttribute('data-network-anchor', a.kind); panel.appendChild(activity);
      para(activity, a.phase === 'show' ? 'Remember these cues in order: ' + a.targets.map(i => a.tokens[i]).join(' → ') : 'Recall the sequence: ' + a.entered.length + ' of ' + a.targets.length + ' cues.');
      const tiles = row(activity), order = a.tokens.map((_, i) => i).sort((x, y) => (x * 7 + 3) % 11 - (y * 7 + 3) % 11);
      for (const index of order) button(tiles, a.tokens[index], () => anchorChoose(game, index), { 'network-anchor-token': index }, a.phase !== 'answer');
      button(row(activity), 'Replay this remembered sequence', () => startAnchor(game, a.kind), { 'network-anchor-replay': '1' });
      button(row(activity), 'Pause and return later', () => { n.anchor = null; notify(game, 'You pause the exercise. Your condition and prior progress remain.', true); save(game); }, { 'network-anchor-pause': '1' });
    }
    if (escapeClue(game)) { panel.appendChild(node('h3', 'A clue to test through observation')); para(panel, escapeClue(game)); }
    para(panel, 'Meaningful objectives: ' + Object.entries({ contact: 'receive contact', reply: 'transmit a reply', thoughtfulResponse: 'consider a communication decision', practice: 'complete a mental or physical project' }).map(([key, label]) => (n.objectives[key] ? '✓ ' : '○ ') + label).join(' · ') + ' · ' + (n.clues.changeover ? '✓ ' : '○ ') + 'decode a guard-routine clue', 'pow-dim');
  }
  P.Solidarity = { initial, state, available, message, received, sent, render, step, afterInterview, afterActivity, decide, backusSelect, backusMatch, startAnchor, anchorChoose, ready, escapeClue, normalize, data: { records: copy(RECORDS), course: copy(COURSE), scout: SCOUT.slice(), oath: OATH.slice(), principles: copy(PRINCIPLES), backus: copy(BACK_US) } };
})(typeof window !== 'undefined' ? window : globalThis);
