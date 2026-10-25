/* Optional, authored flight guidance. Reads the existing aircraft, radar and
   approach records; never changes flight controls, physics, weapons or grades. */
(function (root) {
  'use strict';
  const FT = 3.280839895, KT = 1.943844492, NM = 1852, RAD = 180 / Math.PI;
  const states = new WeakMap(), overrides = new WeakMap();
  const STORE_KEY = 'flightCoach22';
  let context = null, installed = null, savedEnabled = null, ui = null;
  const finite = (value, fallback = null) => Number.isFinite(value) ? value : fallback;
  const round = value => Math.round(value);
  const validPoint = p => Array.isArray(p) && p.length >= 3 && p.every(Number.isFinite);
  function data(game) {
    if (!game || !game.ac || !game.world) return null;
    const a = game.ac, w = game.world, mission = game.mis || {};
    const position = validPoint(a.p) ? a.p : null;
    const bearing = p => {
      if (!position || !validPoint(p)) return null;
      const dx = p[0] - position[0], dz = p[2] - position[2];
      return { heading: ((Math.atan2(dx, -dz) * RAD) % 360 + 360) % 360, rangeNM: Math.hypot(dx, dz) / NM };
    };
    const checkpoint = w.route && w.route[w.rtIdx || 0];
    const navError = w.nav && Number.isFinite(w.nav.ex) && Number.isFinite(w.nav.ez) ? Math.hypot(w.nav.ex, w.nav.ez) : null;
    const targets = Array.isArray(w.targets) ? w.targets.filter(t => !t.bonus) : [];
    return {
      seat: game.rightSeat ? 'BN' : 'PILOT', phase: game.phase, onDeck: !!a.onDeck, cat: finite(a.cat, 0),
      knots: finite(a.ias) === null ? null : a.ias * KT, altitudeFt: position ? position[1] * FT : null,
      clearanceFt: finite(a.radalt) === null ? null : a.radalt * FT,
      bankDeg: finite(a.roll) === null ? null : a.roll * RAD, aoaDeg: finite(a.aoa) === null ? null : a.aoa * RAD,
      throttle: finite(a.thr), fuelLb: finite(a.fuel), gear: !!a.gear, hook: !!a.hook,
      bombs: finite(a.bombs, 0), arms: finite(a.arms, 0), pilotAvailable: !a.crew || a.crew.pilot > 0,
      ship: bearing(w.carrier && w.carrier.p), checkpoint: checkpoint && bearing(checkpoint.p),
      checkpointLabel: checkpoint && checkpoint.label || 'route checkpoint', navErrorM: navError,
      fixes: w.nav ? finite(w.nav.fixes, 0) : null, routeLength: Array.isArray(w.route) ? w.route.length : 0,
      designated: !!w.designated, locked: !!w.lock, blind: !!w.blind,
      offset: w.oap ? { label: w.oap.label || 'offset point', locked: !!w.oapLocked, position: bearing(w.oap.p) } : null,
      solution: game.sol && { valid: !!game.sol.valid, azimuthDeg: finite(game.sol.az) === null ? null : game.sol.az * RAD, releaseSeconds: finite(game.sol.tRel) },
      glideslopeError: finite(game.gsErr), lineupM: finite(game.lineErr), rampDistanceM: finite(game.rampD),
      waveoff: !!game.waveoff, coupled: !!game.aclsCoupled, departed: !!game.departed, egress: !!game.egressCalled,
      type: mission.type, noRelease: !!mission.noRelease || mission.type === 'recce' || !!mission.free,
      remainingTargets: targets.filter(t => t.alive).length, totalTargets: targets.length,
      unidentified: targets.filter(t => !t.ident).length,
      emitterOn: !!(w.radar && w.radar.alive && w.radar.emitting),
      dianeDamage: a.dmg ? finite(a.dmg.diane, 0) : 0,
      consent: !!(game.app && (game.app.keys && game.app.keys.Space || game.app.gctl && game.app.gctl.commit))
    };
  }
  function isFlight(game, allowPaused = false) {
    return !!(game && game.ac && game.world && game.ac.alive !== false && !game.pow && !game.evade && !game.chute &&
      !game.result && (allowPaused || !game.paused) && ['deck', 'airborne', 'recovery'].includes(game.phase) &&
      (!game.app || !game.app.screen || game.app.screen === 'game'));
  }
  function enabled(game) {
    return !!(game && overrides.has(game) ? overrides.get(game) : game && game.mis && game.mis.coachPractice || (savedEnabled === null ? game && game.rightSeat : savedEnabled));
  }
  function state(game) {
    if (!states.has(game)) states.set(game, { elapsed: 0, samples: 0, lowClearanceSeconds: 0, attackBankSeconds: 0,
      unconfiguredSeconds: 0, maxNavErrorM: 0, minClearanceFt: null, cue: null, cueAge: 0, pending: null, pendingAge: 0, shown: {}, report: null });
    return states.get(game);
  }
  function setEnabled(on, game, persist = true) {
    on = !!on;
    if (game) overrides.set(game, on);
    if (persist) {
      savedEnabled = on;
      if (context && context.Store && context.Store.set) context.Store.set(STORE_KEY, on);
    }
    if (game && !on && states.has(game)) states.get(game).cue = null;
    if (on && game) tick(game, 0);
    else render(game || context && context.App && context.App.game);
    return on;
  }
  function controls(game) {
    const touch = context && typeof context.touch === 'boolean' ? context.touch : !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    return touch ? { power: 'THR +', lowerPower: 'THR −', launch: 'COMMIT', gear: 'GEAR', scope: 'SCOPE', slew: 'drag the crosshairs', fixSlew: 'drag', lock: 'LOCK', consent: 'COMMIT', steer: 'STEER', chart: 'CHART' }
      : { power: 'Shift', lowerPower: 'Ctrl', launch: 'Space', gear: 'G', scope: 'Tab / SCOPE', slew: 'X, then arrows', fixSlew: 'X + arrows', lock: 'Enter / LOCK', consent: 'Space / COMMIT', steer: 'C / STEER', chart: 'M / CHART' };
  }
  function cue(game) {
    if (!isFlight(game)) return null;
    const s = data(game), c = controls(game), bn = s.seat === 'BN';
    const make = (id, title, text, priority = 30) => ({ id, title, text, priority, seat: s.seat, facts: s });
    const course = target => target ? ('000' + round(target.heading)).slice(-3) + '° · ' + target.rangeNM.toFixed(1) + ' NM' : 'the bearing needle and DME';
    if (bn && !s.pilotAvailable) return make('pilot-unavailable', 'Emergency flying from the right seat', 'The pilot cannot fly. The existing stick or W A S D now controls the aircraft. Turn toward the ship (' + course(s.ship) + '); watch for the existing ACLS coupling indication.', 100);
    if (s.onDeck) {
      if (s.cat > 0) return make('cat-stroke', 'During the catapult stroke', bn ? 'The pilot is taking the shot. Let the aircraft fly off the bow; prepare the navigation and radar checks.' : 'Keep the controls steady through the stroke. Let the aircraft fly off the bow before easing into the climb.', 75);
      if (bn) {
        const task = s.type === 'carrier_only' ? 'monitor route, fuel and recovery.' : s.noRelease ? 'follow the identification track; retain every weapon.' : s.type === 'ironhand' ? 'navigate; press ' + c.consent + ' once per ARM when the radar transmits.' : 'fix navigation, identify + LOCK; hold ' + c.consent + ' for bombs.';
        return make('bn-launch', 'B/N · pilot flies', 'The existing pilot handles power, launch and flying. You: ' + task + ' First: ' + c.chart + ' for the route.', 35);
      }
      if (s.throttle !== null && s.throttle < .94) return make('launch-power', 'Bring up launch power', 'Throttle is ' + round(s.throttle * 100) + '%. Hold ' + c.power + ' to bring it up, then hold ' + c.launch + ' for the catapult shot.', 65);
      return make('launch-ready', 'Ready on the catapult', 'Power is up. Hold ' + c.launch + ' for the shot, then keep the controls steady until airborne.', 45);
    }
    if (s.phase === 'recovery') {
      if (s.waveoff) return make('waveoff', 'An unstable approach', bn ? 'The existing LSO has called a waveoff. Monitor the pilot and navigation; use the normal emergency controls only if he cannot fly.' : 'Follow the existing LSO waveoff. Add power with ' + c.power + ', climb away and set up a stable approach.', 100);
      if (s.coupled) return make('coupled', 'ACLS coupled', 'The existing carrier system is flying the approach. Monitor the instruments and coupling indication; the coach has not taken control.', 70);
      if ((!s.gear || !s.hook) && s.knots !== null && s.knots > 260) return make('gear-speed-limit', 'Slow before operating the gear', 'Airspeed is ' + s.knots.toFixed(1) + ' KIAS. The game’s existing GEAR control rejects operations above 260 KIAS. ' + (bn ? 'Monitor the pilot slowing for recovery.' : 'Reduce power smoothly with ' + c.lowerPower + ', then configure below the limit.'), 85);
      if (!s.gear || !s.hook) return make('approach-config', 'Configure before the groove', bn ? 'Gear or hook is not down. Monitor the pilot’s recovery and the GEAR indication; the existing pilot normally configures the aircraft.' : 'Use ' + c.gear + ' to lower gear and hook. Configure before the groove so you can concentrate on the ball and lineup.', 85);
      if (s.rampDistanceM !== null && s.rampDistanceM > 0 && s.rampDistanceM < 1500) {
        if (s.glideslopeError !== null && s.glideslopeError < -.55) return make('approach-low', 'Below the glideslope', bn ? 'The ball is low. Monitor the pilot and the LSO’s power calls; keep the recovery instruments in view.' : 'The ball is low. Add a small amount of power with ' + c.power + ' and reassess. Keep lineup steady; avoid large corrections.', 80);
        if (s.glideslopeError !== null && s.glideslopeError > .75) return make('approach-high', 'Above the glideslope', bn ? 'The ball is high. Monitor the pilot and the LSO; avoid distracting changes to navigation during the groove.' : 'The ball is high. Reduce power smoothly with ' + c.lowerPower + ' and reassess; do not dive or flare at the deck.', 78);
        if (s.lineupM !== null && Math.abs(s.lineupM) > 13) return make('approach-lineup', 'Correct the lineup', 'Deck centerline error is ' + round(Math.abs(s.lineupM)) + ' m. ' + (bn ? 'Monitor the pilot and the LSO’s lineup calls.' : 'Make a small correction ' + (s.lineupM > 0 ? 'left' : 'right') + ', then stop the correction as the lineup centers.'), 76);
        if (s.aoaDeg !== null && s.aoaDeg > 11.5) return make('approach-slow', 'Above on-speed angle of attack', bn ? 'The indexer indicates slow. Monitor the pilot and the LSO; the green doughnut is the on-speed reference.' : 'The indexer indicates slow. Add power smoothly and return to the green doughnut, rather than chasing a fixed airspeed.', 74);
        if (s.aoaDeg !== null && s.aoaDeg < 6.6) return make('approach-fast', 'Below on-speed angle of attack', bn ? 'The indexer indicates fast. Monitor the pilot’s correction toward the green doughnut.' : 'The indexer indicates fast. Reduce power smoothly and use attitude to settle onto the green doughnut.', 73);
        return make('approach-stable', 'Ball · lineup · angle of attack', bn ? 'Monitor the green doughnut, ball and lineup. The pilot flies the approach; the coach only describes the existing indications.' : 'Maintain the green doughnut and small corrections for ball and lineup. Fly into the deck; do not flare. Be ready with power if the hook misses.', 55);
      }
      return make('recovery-setup', bn ? 'B/N · monitor the return' : 'Set up the recovery', 'Ship ' + course(s.ship) + '. ' + (bn ? 'The pilot flies and configures the approach. Use ' + c.scope + ' to look up; monitor TACAN, fuel, gear and hook. Watch for ACLS COUPLED.' : 'Reduce speed gradually, configure and establish the approach before taking the ball.'), 50);
    }
    if (s.fuelLb !== null && s.fuelLb < 700) return make('fuel-low', 'Low fuel · prioritize recovery', round(s.fuelLb) + ' lb remains. Turn toward the ship (' + course(s.ship) + '); avoid extra attack passes and watch the engine and recovery indications.', 92);
    if (s.clearanceFt !== null && s.clearanceFt < 200 && s.knots !== null && s.knots > 100 && s.cat <= 0) return make('terrain-low', 'Check terrain clearance', 'Radar altitude is ' + round(s.clearanceFt) + ' ft. ' + (bn ? 'Warn the pilot and monitor the terrain display.' : 'Look ahead and ease away from rising terrain; barometric altitude is not clearance.'), 90);
    if (s.gear && s.altitudeFt !== null && s.altitudeFt > 250 && (!s.departed || s.ship && s.ship.rangeNM > 6500 / NM)) {
      if (s.knots !== null && s.knots > 260) return make('gear-speed-limit', 'Slow before operating the gear', 'Airspeed is ' + s.knots.toFixed(1) + ' KIAS. The game’s existing GEAR control rejects operations above 260 KIAS. ' + (bn ? 'The GEAR control is available in either game seat; use it below the limit if cleanup is required.' : 'Reduce power with ' + c.lowerPower + ' and let speed fall below the limit before using ' + c.gear + '.'), 70);
      return make('clean-up', 'Clean up after launch', bn ? 'The gear is still down above 250 ft. The game’s ' + c.gear + ' control is available in either seat if cleanup is required; then continue the navigation scan.' : 'Above 250 ft with the gear still down: use ' + c.gear + ' to retract gear and hook, then settle into the climb.', 50);
    }
    if (s.dianeDamage > .8) return make('diane-unavailable', 'DIANE is badly damaged', 'The existing scope cannot accept a normal lock. Navigate toward the ship (' + course(s.ship) + ') and monitor the surviving instruments.', 80);
    if (s.type === 'carrier_only') {
      if (!s.departed && s.altitudeFt !== null && s.altitudeFt < 1300) return make('pattern-climb', 'Practice a smooth climb', 'Altitude ' + round(s.altitudeFt) + ' ft. ' + (bn ? 'Monitor the pilot’s climb toward the mission’s 1,500 ft pattern reference.' : 'Ease into the climb toward the mission’s 1,500 ft pattern reference, then reduce the input and let the aircraft settle.'), 35);
      if (!s.departed) return make('pattern-outbound', 'Make room for the return', 'Ship ' + course(s.ship) + '. Fly away from the ship before turning back; the existing recovery phase begins after departure, not immediately after launch.', 30);
      return make('pattern-home', 'Find the moving ship', 'Ship ' + course(s.ship) + '. ' + (bn ? 'Use navigation indications to monitor the return; the pilot flies.' : 'Turn toward the TACAN bearing needle and watch DME count down. The ship continues moving.'), 35);
    }
    if (s.egress || !s.noRelease && ((s.totalTargets > 0 && s.remainingTargets === 0) || (s.bombs === 0 && s.arms === 0))) return make('egress', bn ? 'B/N · release consent, monitor home' : 'Return after the attack', 'Ship ' + course(s.ship) + '. ' + (bn ? 'Release ' + c.consent + '. The pilot is returning to the ship. Open ' + c.chart + '; monitor fuel, TACAN bearing and DME, then the recovery indications.' : 'Turn feet wet toward the ship and prepare for recovery.'), 45);
    if (s.noRelease) return make('weapons-tight', s.type === 'recce' ? 'Identify · retain ordnance' : 'Navigation practice · retain ordnance', s.type === 'recce' ? s.unidentified + ' contact(s) remain unidentified. Follow the briefed identification track on ' + c.chart + '; do not hold ' + c.consent + ' to release ordnance.' : 'This flight is not cleared for weapon release. Follow the route on ' + c.chart + '; use the navigation instruments and retain all weapons.', 65);
    if (s.type === 'ironhand' && s.arms > 0) return make(s.emitterOn ? 'arm-emitting' : 'arm-wait', 'Iron Hand · existing A-6B mission', s.emitterOn ? 'The radar is transmitting. Press ' + c.consent + ' once to fire a Standard ARM; release before another shot. This same control can also consent to a designated bomb solution.' : 'The emitter is not transmitting. Watch the threat and seeker indications; wait for transmission before pressing ' + c.consent + ' for the missile shot.', 62);
    if (!s.designated && s.checkpoint && s.checkpoint.rangeNM < 26000 / NM) {
      const error = s.navErrorM === null ? '' : ' · SYS ERR ' + round(s.navErrorM * 1.0936133) + ' yd';
      return make('navigation-fix', bn ? 'B/N · take a radar fix' : 'Navigation check before attack', s.checkpointLabel + ' ' + course(s.checkpoint) + error + '. ' + c.scope + ': ' + c.fixSlew + ' onto real return; ' + c.lock + ' for a fix, not a target designation.' + (bn ? ' ' + c.steer + ' points pilot at crosshairs.' : ''), 45);
    }
    if (s.offset && (!s.designated || s.offset.locked)) return make(s.offset.locked ? 'offset-shift' : 'offset-acquire', s.offset.locked ? 'B/N · LOCK again to shift to the target' : 'B/N · lock the offset landmark', s.offset.locked ? 'The offset landmark is locked; it is not the target. Keep the crosshairs there and press ' + c.lock + ' again to apply the briefed bearing and range. Then check the attack solution.' : s.offset.label + ' ' + course(s.offset.position) + '. The target does not paint. Use ' + c.slew + ' onto this briefed landmark, then ' + c.lock + '. You will LOCK again to shift onto the target.', 49);
    if (!s.designated) return make(s.blind ? 'blind-designation' : 'designation', s.blind ? 'Use the briefed coordinates' : 'Find and designate the target', s.blind ? 'The target does not paint. Check route fixes, use ' + c.slew + ' for the briefed ring, then ' + c.lock + '. Navigation error carries into this coordinate attack.' : 'Use ' + c.scope + ' to compare the radar returns with the briefing. Use ' + c.lock + ' on the identified return; ' + (bn ? c.steer + ' gives the pilot a steer.' : 'keep flight stable while working the radar.'), 35);
    if (game._relArm === 0 && s.bombs > 0) return make('new-run', 'One ripple per run', 'The previous ripple has released. Set up another run only if the mission and remaining fuel require it; the existing computer must re-arm on a fresh solution.', 45);
    if (!s.solution || !s.solution.valid) return make('solution-wait', 'Designation is not yet a release solution', 'The computer does not have a valid release solution. Check track, altitude and the designation; ' + (bn ? 'give the pilot a useful steer.' : 'approach smoothly with the wings settled.'), 50);
    if (s.bankDeg !== null && Math.abs(s.bankDeg) > 8) return make('attack-bank', 'Settle the attack run', 'Bank is ' + round(Math.abs(s.bankDeg)) + '°. ' + (bn ? 'Monitor the pilot holding the run steady.' : 'Ease the wings level and hold the run-in heading.') + ' The existing computer still determines release.', 58);
    if (s.solution.azimuthDeg !== null && Math.abs(s.solution.azimuthDeg) > .028 * RAD) return make('attack-align', 'Center the steering needle', 'Steering error is ' + Math.abs(s.solution.azimuthDeg).toFixed(1) + '°. ' + (bn ? 'Monitor the pilot centering the needle; keep the designation steady.' : 'Center the vertical steering needle with small corrections before expecting release.'), 55);
    return make(s.consent ? 'attack-consent' : 'attack-ready', bn ? 'B/N · HOLD consent for bomb release' : 'Hold a steady release run', (s.solution.releaseSeconds !== null && s.solution.releaseSeconds > 0 ? 'Solution release in about ' + Math.ceil(s.solution.releaseSeconds) + ' s. ' : '') + (s.consent ? 'Consent is held; MASTER ARM is on. ' + (bn ? 'The pilot flies the needles. ' : '') + 'The computer chooses release; let go after bombs away.' : 'Hold ' + c.consent + ' through the solution when cleared. Holding also sets MASTER ARM; release returns SAFE. The computer releases; a tap is not a manual bomb drop.'), 48);
  }
  function tick(game, dt) {
    if (!isFlight(game) || !enabled(game)) { render(game); return null; }
    dt = Math.max(0, Math.min(.25, finite(dt, 0)));
    const current = cue(game), s = state(game), d = current && current.facts;
    if (!d) { render(game); return null; }
    s.elapsed += dt; if (dt > 0) s.samples++;
    if (!d.onDeck && d.phase !== 'recovery' && d.knots > 100 && d.clearanceFt !== null) {
      s.minClearanceFt = s.minClearanceFt === null ? d.clearanceFt : Math.min(s.minClearanceFt, d.clearanceFt);
      if (d.clearanceFt < 200) s.lowClearanceSeconds += dt;
    }
    if (d.designated && d.solution && d.solution.valid && Math.abs(d.bankDeg) > 8 && d.phase !== 'recovery') s.attackBankSeconds += dt;
    if (d.phase === 'recovery' && (!d.gear || !d.hook)) s.unconfiguredSeconds += dt;
    if (d.navErrorM !== null) s.maxNavErrorM = Math.max(s.maxNavErrorM, d.navErrorM);
    s.cueAge += dt;
    if (!s.cue || current.id === s.cue.id) { s.cue = current; s.pending = null; s.pendingAge = 0; }
    else {
      if (s.pending === current.id) s.pendingAge += dt; else { s.pending = current.id; s.pendingAge = dt; }
      if (current.priority >= 90 || s.cueAge >= 3 && s.pendingAge >= .5) { s.cue = current; s.cueAge = 0; s.pending = null; s.pendingAge = 0; }
    }
    if (!s.shown[s.cue.id]) s.shown[s.cue.id] = true;
    render(game); return s.cue;
  }
  function report(game, landed, reason) {
    if (!game || !game.world || game.pow || game.mis && game.mis.escape) return null;
    const observed = states.get(game);
    if (!observed || !observed.samples) return null;
    if (observed.report) return observed.report;
    const score = game.world.score || {}, advice = [], evidence = [], label = game.rightSeat ? 'B/N' : 'pilot';
    const add = (finding, text) => { evidence.push(finding); advice.push(text); };
    if (game.ac && finite(game.ac.fuel) !== null) evidence.push('Fuel at this debrief: ' + round(game.ac.fuel) + ' lb.');
    if (observed.minClearanceFt !== null) evidence.push('Minimum radar altitude during observed airborne intervals: ' + round(observed.minClearanceFt) + ' ft.');
    const pairs = Array.isArray(game.approachLog) ? game.approachLog.filter(p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite)) : [];
    if (landed && pairs.length) {
      const meanGS = pairs.reduce((n, p) => n + p[0], 0) / pairs.length, meanLine = pairs.reduce((n, p) => n + p[1], 0) / pairs.length;
      evidence.push('Recorded approach: mean absolute glideslope deviation ' + meanGS.toFixed(2) + ', mean absolute lineup error ' + meanLine.toFixed(1) + ' m (' + pairs.length + ' samples).');
      if (meanGS > .55) advice.push('Work on a stable ball before the final quarter mile; make smaller power corrections and reassess after each one.');
      if (meanLine > 13) advice.push('Set up the angled-deck lineup earlier. Stop each lateral correction as the centerline returns rather than reversing large corrections.');
    }
    if (finite(game.bolters, 0) > 0) add(game.bolters + ' bolter(s) recorded.', 'Practice another stabilized pattern and be ready with power at touchdown in case the hook misses.');
    if (game.mis && (game.mis.noRelease || game.mis.type === 'recce') && finite(score.dropped, 0) > 0) add(score.dropped + ' weapon(s) released during a weapons-tight mission.', 'Repeat the identification sortie while retaining ordnance. The attack consent control also releases weapons; identification does not need it.');
    const misses = Array.isArray(score.cep) ? score.cep.filter(Number.isFinite) : [];
    const meanMiss = misses.length ? misses.reduce((n, v) => n + v, 0) / misses.length : null;
    if (meanMiss !== null) {
      evidence.push('Recorded mean miss distance: ' + round(meanMiss * FT) + ' ft (' + misses.length + ' recorded weapon impacts).');
      if (meanMiss > 90) advice.push('On the next run verify the designation and navigation fixes, then hold the steering needle steady through release. Miss distance alone does not establish which direction the bombs went.');
    }
    if (finite(game.world.navErrAtRelease) !== null && game.world.navErrAtRelease > 200) add('Recorded navigation error at release: ' + round(game.world.navErrAtRelease * 1.0936133) + ' yd.', 'Take the radar checkpoint fixes before designation, especially on a coordinate attack. A clean release solution can still refer to an incorrect system position.');
    if (game.world.nav) evidence.push('Radar fixes recorded: ' + finite(game.world.nav.fixes, 0) + ' of ' + (Array.isArray(game.world.route) ? game.world.route.length : 0) + ' route checkpoints.');
    if (observed.lowClearanceSeconds >= 1) add('Coach observed ' + observed.lowClearanceSeconds.toFixed(1) + ' s below 200 ft radar altitude; minimum ' + round(observed.minClearanceFt) + ' ft.', 'Practice reading radar altitude and the ground ahead, rather than using barometric altitude as terrain clearance.');
    if (observed.attackBankSeconds >= 1) add('Coach observed ' + observed.attackBankSeconds.toFixed(1) + ' s above 8° bank during a valid designated attack run.', 'Settle the bank before the release run and use smaller steering corrections. This observation is not proof that bank alone caused a miss.');
    if (observed.unconfiguredSeconds >= 1) add('Coach observed ' + observed.unconfiguredSeconds.toFixed(1) + ' s in recovery without both gear and hook down.', 'Configure earlier in the pattern so the final approach scan can stay on ball, lineup and angle of attack.');
    if (!advice.length) advice.push(landed ? 'Repeat the same setup and compare the recorded ball, lineup and navigation figures across runs. A short coaching sample is not an assessment of the whole sortie.' : 'Use another practice run to observe launch, route fixes and recovery. The coach recorded only the intervals during which guidance was enabled.');
    const review = { title: 'Flight practice review · authored guidance', seat: label, observedSeconds: observed.elapsed,
      evidence, advice: advice.slice(0, 4), landed: !!landed, reason: typeof reason === 'string' ? reason : '',
      note: 'Based on existing game measurements, not an authentic crew quotation or real-world qualification. Guidance does not change the mission grade.' };
    if (game.result || game.phase === 'done') observed.report = review;
    return review;
  }
  function mount() {
    if (ui || typeof document === 'undefined') return ui;
    const host = document.getElementById('game'); if (!host) return null;
    const box = document.createElement('section'); box.id = 'flightCoach'; box.hidden = true;
    const css = document.createElement('style');
    css.textContent = '#flightCoach{position:absolute;right:calc(86px + env(safe-area-inset-right,0px));top:calc(72px + env(safe-area-inset-top,0px));z-index:26;width:min(280px,calc(100vw - 120px));pointer-events:none}#flightCoach[hidden]{display:none}#flightCoachToggle{min-height:44px;width:160px;max-width:100%;padding:6px 10px;border:1px solid #8c9b99;border-radius:4px;background:rgba(9,18,23,.92);color:#e9efda;font:600 11px system-ui,sans-serif;pointer-events:auto;touch-action:manipulation}#flightCoachToggle[aria-pressed="true"]{border-color:#b8c383;color:#e6efbb}#flightCoachCue{margin-top:4px;padding:8px 10px;border-left:2px solid #b8c383;background:rgba(9,18,23,.88);font:12px/1.35 system-ui,sans-serif;color:#dde4e8;max-height:144px;overflow:hidden}#flightCoachCue strong{display:block;color:#e5edbd;font-size:12px;margin-bottom:4px}#flightCoachCue small{display:block;margin-top:5px;color:#a6b4ba;font-size:9px}#flightCoachToggle:focus-visible{outline:3px solid #e8d59b;outline-offset:2px}@media(max-height:470px){#flightCoach{top:calc(46px + env(safe-area-inset-top,0px));width:min(245px,calc(100vw - 120px))}#flightCoachCue{font-size:11px;max-height:118px;padding:6px 8px}#flightCoachCue strong{font-size:11px}}';
    const toggle = document.createElement('button'); toggle.id = 'flightCoachToggle'; toggle.type = 'button';
    toggle.setAttribute('data-flight-coach-toggle', ''); toggle.setAttribute('aria-controls', 'flightCoachCue');
    toggle.onclick = event => {
      event.stopPropagation(); const game = context && context.App && context.App.game;
      if (game) setEnabled(!enabled(game), game);
      // Space is the existing launch/release input. After changing guidance,
      // return keyboard focus to the flight so Space does not click this toggle.
      toggle.blur();
    };
    const panel = document.createElement('div'); panel.id = 'flightCoachCue'; panel.setAttribute('data-flight-coach-cue', '');
    const title = document.createElement('strong'), text = document.createElement('span'), note = document.createElement('small');
    note.textContent = 'Authored guidance'; panel.append(title, text, note);
    box.append(css, toggle, panel); host.append(box); ui = { box, toggle, panel, title, text }; return ui;
  }
  function render(game) {
    const u = mount(); if (!u) return;
    // The computer demonstration already presents its own current control,
    // observation and objective checklist. Restore the optional flight coach
    // immediately when the player takes over, without changing its preference.
    const demonstration = root.MissionDemo && root.MissionDemo.snapshot(game);
    const visible = isFlight(game) && !(demonstration && demonstration.active && demonstration.computerPlaying); u.box.hidden = !visible;
    if (!visible) return;
    const on = enabled(game), current = states.get(game) && states.get(game).cue;
    u.toggle.textContent = on ? 'Flight guidance: ON' : 'Flight guidance: OFF'; u.toggle.setAttribute('aria-pressed', String(on));
    const teach = document.getElementById('teach');
    u.panel.hidden = !on || !current || !!(teach && teach.classList.contains('on'));
    if (current) {
      u.box.dataset.cue = current.id; u.box.dataset.seat = current.seat;
      if (u.title.textContent !== current.title) u.title.textContent = current.title;
      if (u.text.textContent !== current.text) u.text.textContent = current.text;
    }
  }
  function appendReport(game, landed, reason) {
    const review = report(game, landed, reason);
    if (!review || typeof document === 'undefined') return;
    const host = document.getElementById('debriefBody'); if (!host || host.querySelector('[data-flight-coach-report]')) return;
    const box = document.createElement('section'); box.className = 'note'; box.setAttribute('data-flight-coach-report', '');
    const heading = document.createElement('h3'); heading.textContent = review.title; box.append(heading);
    const intro = document.createElement('p'); intro.textContent = 'Seat: ' + review.seat + ' · guidance observed ' + review.observedSeconds.toFixed(1) + ' s. ' + review.note; box.append(intro);
    for (const finding of review.evidence) { const p = document.createElement('p'); p.style.cssText = 'font-size:12px;color:#aebcc4'; p.textContent = finding; box.append(p); }
    const list = document.createElement('ul');
    for (const tip of review.advice) { const item = document.createElement('li'); item.textContent = tip; list.append(item); }
    box.append(list); host.append(box);
  }
  function install(ctx) {
    if (!ctx || !ctx.Game || !ctx.Game.prototype || !ctx.App) return false;
    if (installed) return installed.Game === ctx.Game && installed.App === ctx.App;
    context = ctx;
    const saved = ctx.Store && ctx.Store.get ? ctx.Store.get(STORE_KEY, null) : null;
    savedEnabled = saved === null ? null : !!saved;
    const update = ctx.Game.prototype.update, debrief = ctx.Game.prototype.debrief, show = ctx.App.show;
    if (typeof update !== 'function' || typeof debrief !== 'function') { context = null; return false; }
    const wrappedUpdate = function (dt) { const result = update.apply(this, arguments); tick(this, dt); return result; };
    const wrappedDebrief = function (landed, reason) {
      const previous = this.result, result = debrief.apply(this, arguments);
      if (!previous && this.result && (!this.app || this.app.game === this)) appendReport(this, landed, reason);
      render(this); return result;
    };
    ctx.Game.prototype.update = wrappedUpdate; ctx.Game.prototype.debrief = wrappedDebrief;
    let wrappedShow = null;
    if (typeof show === 'function') {
      wrappedShow = function () { const result = show.apply(this, arguments); render(this.game); return result; };
      ctx.App.show = wrappedShow;
    }
    installed = { Game: ctx.Game, App: ctx.App, update, debrief, show, wrappedUpdate, wrappedDebrief, wrappedShow };
    mount(); return true;
  }
  function uninstall() {
    if (!installed) return false;
    const h = installed;
    if (h.Game.prototype.update === h.wrappedUpdate) h.Game.prototype.update = h.update;
    if (h.Game.prototype.debrief === h.wrappedDebrief) h.Game.prototype.debrief = h.debrief;
    if (h.App.show === h.wrappedShow) h.App.show = h.show;
    if (ui) ui.box.remove();
    ui = null; installed = null; context = null; return true;
  }
  root.FlightCoach = { install, uninstall, tick, cue, snapshot: data, enabled, setEnabled, report,
    reset(game) { if (!game) return false; states.delete(game); overrides.delete(game); render(game); return true; },
    metrics(game) { const s = states.get(game); return s ? { elapsed: s.elapsed, samples: s.samples, lowClearanceSeconds: s.lowClearanceSeconds,
      attackBankSeconds: s.attackBankSeconds, unconfiguredSeconds: s.unconfiguredSeconds, minClearanceFt: s.minClearanceFt,
      maxNavErrorM: s.maxNavErrorM, cues: Object.keys(s.shown) } : null; },
    units: { aircraftPosition: 'm', indicatedSpeed: 'm/s', angles: 'radians', fuel: 'lb', navError: 'm', distance: 'NM = 1852 m' } };
})(window);
