/* Authored visual details for the schematic escape episode. These are neither
 * an architectural survey nor replacements for the historical photographs.
 * This module never changes collision, routes, NPCs, capture, or flight state. */
(function (global) {
  'use strict';
  const P = global.POW;
  if (!P) throw new Error('POW core must load before episode scene.');
  const PREFIX = 'episode-scene:', MAX_DETAIL = 64, LOW_DETAIL = 24;
  const STAGES = new Set(['cell', 'compound', 'hanoi', 'river']);
  const LAMP_IDS = Object.freeze(['cell-bulb', 'corridor-lamp', 'yard-west', 'yard-east',
    'street-lamp-west', 'street-lamp-east', 'ferry-lantern', 'bank-lantern']);
  const cache = new WeakMap();
  const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const copy = value => JSON.parse(JSON.stringify(value));
  const normalize = p => { const length = Math.hypot(...p) || 1; return p.map(v => v / length); };
  const vec = (p, fallback) => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(Number.isFinite) ? p.slice(0, 3) : fallback;

  function active(game) {
    return !!(game && game.pow && game.evade && game.evade.camp !== false
      && (game.phase === undefined || game.phase === 'evade') && STAGES.has(game.pow.stage)
      && !(P.Mindscape && P.Mindscape.active && P.Mindscape.active(game)));
  }
  function initial() {
    const lamps = {}; for (const id of LAMP_IDS) lamps[id] = true;
    return { version: 1, clock: 0, lamps };
  }
  function state(game) {
    const s = game.pow;
    if (!s.episodeScene || s.episodeScene.version !== 1) s.episodeScene = initial();
    const e = s.episodeScene;
    e.clock = clamp(finite(e.clock, 0), 0, 1e7);
    const lamps = {};
    for (const id of LAMP_IDS) lamps[id] = typeof e.lamps?.[id] === 'boolean' ? e.lamps[id] : true;
    e.lamps = lamps;
    return e;
  }
  function quality(game) {
    return clamp(Math.round(finite(game.rend && game.rend.quality,
      finite(game.app && game.app.set && game.app.set.quality, 2))), 0, 2);
  }
  function daylight(game) {
    const r = game.pow.river;
    const hour = r && finite(r.hour, NaN);
    const h = Number.isFinite(hour) ? hour : finite(game._envHour, finite(game.hour, NaN));
    if (Number.isFinite(h)) {
      const local = ((h % 24) + 24) % 24;
      return clamp((local - 5.5) / 1.3, 0, 1) * clamp((19.5 - local) / 1.4, 0, 1);
    }
    return clamp(finite(r && r.daylight, finite(game.atm && game.atm.sunDir && game.atm.sunDir[1], 0) * 2), 0, 1);
  }
  function at(game, x, y, z) {
    const b = game.pow.base; return [b[0] + x, b[1] + y, b[2] + z];
  }
  function lamp(game, id, position, switchPosition, radius, intensity, rgb, kind) {
    const s = state(game), on = s.lamps[id];
    return { id, position, switchPosition, radius, intensity: on ? intensity : 0,
      rgb, on, kind: kind || 'point' };
  }
  function lights(game) {
    const s = game.pow, scene = state(game), day = daylight(game), fade = 1 - day * .86;
    if (s.stage === 'cell' || s.stage === 'compound') {
      const out = [
        lamp(game, 'cell-bulb', at(game, 0, 2.50, -.4), at(game, 1.65, 1.10, -3.38), 5.5, 1.15, [1, .79, .48]),
        lamp(game, 'corridor-lamp', at(game, 7.4, 2.85, -5.6), at(game, 7.4, 1.05, -7.55), 8.5, .85, [1, .76, .42]),
        lamp(game, 'yard-west', at(game, -22, 5.58, 12), at(game, -21.8, 1.10, 12), 24, .80 * fade, [1, .80, .50]),
        lamp(game, 'yard-east', at(game, 22, 5.58, 12), at(game, 21.8, 1.10, 12), 34, 1.35 * fade, [1, .84, .58], 'searchlight')
      ];
      const yaw = -1 + Math.sin(scene.clock * .24) * 1.04;
      const tilt = .245 + Math.cos(scene.clock * .17) * .035;
      out[3].direction = normalize([Math.sin(yaw) * Math.cos(tilt), -Math.sin(tilt), -Math.cos(yaw) * Math.cos(tilt)]);
      out[3].coneCos = Math.cos(.29);
      return out;
    }
    if (s.stage === 'hanoi') return [
      lamp(game, 'street-lamp-west', at(game, 48, 3.7, -23), at(game, 48, 1.10, -27.55), 14, .95 * fade, [1, .77, .44]),
      lamp(game, 'street-lamp-east', at(game, 82, 3.7, -23), at(game, 82, 1.10, -27.55), 14, .78 * fade, [1, .75, .43])
    ];
    const r = s.river || {}, x = s.base[0] + 94, y = finite(r.waterY, s.base[1]);
    const ferry = (game.campGeo || []).find(g => g.id === 'river-landmark-ferry-lantern');
    if (ferry || r.sectionId === 'ferry') {
      const position = ferry ? ferry.p.slice() : [x + 22, y + 2.25, s.base[2] + 42];
      return [lamp(game, 'ferry-lantern', position,
        [position[0], y + 1.05, position[2] + .55], 13, .85 * fade, [1, .66, .30])];
    }
    const p = r.phase === 'gulf' ? [x - 50, y + 1.9, s.base[2] - 75] : [x + 18, y + 1.9, s.base[2] + 36];
    return [lamp(game, 'bank-lantern', p, [p[0], y + .95, p[2]], 9, .40 * fade, [1, .71, .39])];
  }

  // Definitions remain data until selected for the quality budget. Surface
  // layers sit just outside existing faces, avoiding depth fighting. No extra
  // solid is created: the original walls/doors remain the collision authority.
  function blueprints(game, localLights) {
    const s = game.pow, b = s.base, definitions = [];
    const box = (id, mesh, x, y, z, hx, hy, hz, tint, yaw) => definitions.push({
      id: PREFIX + id, mesh, x, y, z, hx, hy, hz, tint: tint || [1, 1, 1, 0], yaw: yaw || 0
    });
    const plaster = [.87, 1.06, .95, 0], lime = [1.20, 1.23, 1.03, 0], damp = [.62, .75, .66, 0];
    const timber = [1.27, 1.04, .71, 0], rust = [1.55, .83, .48, 0];
    if (s.stage === 'cell' || s.stage === 'compound') {
      for (const side of [-1, 1]) {
        box('cell-plaster-' + side, 'powStone', side * 2.589, 1.47, 0, .007, 1.36, 3.35, plaster);
        box('cell-damp-band-' + side, 'powStone', side * 2.578, .37, .3, .007, .24, 3.02, damp);
        for (let n = 0; n < 3; n++) box('cell-wear-' + side + '-' + n, 'powStone', side * 2.566,
          .80 + n * .44, -2.20 + n * 1.83, .008, .13 + n * .045, .34 + n * .08, lime);
      }
      box('cell-rear-plaster', 'powStone', 0, 1.47, 3.389, 2.57, 1.34, .007, plaster);
      box('cell-rear-damp', 'powStone', .35, .34, 3.378, 2.22, .25, .007, damp);
      for (const z of [-2.5, .1, 2.6]) box('cell-roof-timber-' + z, 'powWood', 0, 3.01, z, 2.61, .09, .085, timber);
      for (const z of [-1.2, 1.2]) box('cell-floor-joint-' + z, 'powDark', 0, .016, z, 2.57, .006, .016, [.55, .58, .53, 0]);
      if (!s.flags?.doorOpen) {
        for (const y of [.62, 1.92]) box('door-rusted-hinge-' + y, 'powMetal', -.78, y, -3.488, .065, .11, .018, rust);
        box('door-lock-backing', 'powMetal', .51, 1.0, -3.466, .115, .155, .008, [1.10, .96, .72, 0]);
      }
      for (const x of [1.9, 7.4, 12.2]) {
        box('corridor-timber-' + x, 'powWood', x, 2.99, -5.7, .075, .075, 1.96, timber);
        box('corridor-lime-' + x, 'powStone', x, 1.75, -3.793, 1.6, .78, .007, lime);
      }
      for (const x of [-26.64, 26.64]) {
        box('yard-wall-cap-' + x, 'powStone', x, 3.42, -4, .32, .11, 35.75, [.80, .91, .81, 0]);
        for (let n = 0; n < 3; n++) box('yard-weather-' + x + '-' + n, 'powStone', x + Math.sign(x) * -.01,
          1.18, -27 + n * 23, .009, .85, 4.0, damp);
      }
      for (const z of [-33.7, -16.2]) box('roof-edge-drip-' + z, 'powMetal', 17.5, 3.26, z, 8.85, .048, .085, rust);
      for (const x of [9.5, 16, 23]) box('roof-water-mark-' + x, 'powStone', x, 3.409, -27,
        .73, .004, 2.55, [.68, .82, .73, 0]);
      for (const z of [7, 11, 15, 19]) box('yard-door-frame-' + z, 'powWood', -12.869, 2.22, z,
        .012, .048, .78, timber);
    } else if (s.stage === 'hanoi') {
      const blocks = [[38, -39, 6, 9, 6], [55, -38, 7, 9, 7], [75, -42, 8, 13, 7], [97, -44, 9, 13, 6],
        [39, 0, 7, 16, 6], [59, 4, 8, 20, 5], [80, 2, 7, 18, 7], [103, 8, 8, 21, 5]];
      for (let n = 0; n < blocks.length; n++) {
        const [x, z, hx, hz, height] = blocks[n], north = z < -20, face = z + (north ? hz : -hz);
        const outward = north ? .022 : -.022, tone = n % 3 === 0 ? plaster : n % 3 === 1 ? lime : [1.04, .92, .77, 0];
        box('street-plaster-' + n, 'powStone', x, height * .50, face + outward, hx - .1, height * .46, .009, tone);
        box('street-foundation-' + n, 'powStone', x, .42, face + outward * 1.7, hx - .13, .35, .009, damp);
        box('street-eave-' + n, 'powWood', x, height + .20, face + outward * 2, hx + .25, .11, .34, timber);
        box('street-gutter-' + n, 'powMetal', x, height -.06, face + outward * 3.5, hx + .15, .036, .054, rust);
        for (const side of [-1, 1]) {
          const wx = x + side * (hx * .50), wz = face + outward * 2.4;
          box('street-shutter-' + n + '-' + side, 'powWood', wx, 2.70, wz, .38, .62, .025, timber);
          box('street-shutter-frame-' + n + '-' + side, 'powMetal', wx, 2.70, wz + outward,
            .42, .028, .017, rust);
        }
      }
    } else {
      const r = s.river || {}, y = finite(r.waterY, b[1]) - b[1];
      // Faint sediment edge bands are grounded on the existing bank. Reflected
      // water and currents are uniforms, rather than transparent overlay art.
      if (r.phase !== 'gulf') for (const side of [-1, 1]) {
        box('river-silt-' + side, 'powMud', 94 + side * 16.2, y + .358, 30,
          .72, .006, 123, [1.28, 1.17, .87, 0]);
        for (const z of [-48, 12, 72]) box('river-reed-shadow-' + side + '-' + z, 'powMud', 94 + side * 20,
          y + .364, z, 2.3, .006, 6, [.72, .82, .63, 0]);
      }
      for (const g of game.campGeo || []) if (/^river-landmark-.*-shelter-roof$/.test(g.id)) {
        const x = g.p[0] - b[0], z = g.p[2] - b[2];
        box('landing-rust-' + g.id, 'powMetal', x, g.p[1] - b[1] - .01, z - 2.72,
          2.10, .04, .04, rust);
        box('landing-timber-' + g.id, 'powWood', x, g.p[1] - b[1] - .14, z,
          2.03, .038, .052, timber);
      }
    }
    for (const light of localLights) {
      const [x, y, z] = light.position.map((v, i) => v - b[i]);
      if (light.id.startsWith('street-lamp')) {
        box(light.id + '-wall-arm', 'powMetal', x, y + .03, z - 2.76, .034, .055, 2.80, rust);
        box(light.id + '-wall-plate', 'powMetal', x, y -.25, z - 5.55, .12, .22, .035, rust);
      } else if (light.id === 'cell-bulb' || light.id === 'corridor-lamp') {
        box(light.id + '-mount', 'powMetal', x, y + .18, z, .16, .023, .13, rust);
        box(light.id + '-wire', 'powMetal', x, y + .11, z, .011, .09, .011, [.78, .83, .76, 0]);
      } else if (light.id === 'bank-lantern') {
        box(light.id + '-post', 'powWood', x, y / 2, z, .06, Math.max(.2, y / 2), .06, timber);
      } else box(light.id + '-hood', 'powMetal', x, y + .12, z, .24, .052, .19, [.68, .82, .82, 0]);
      box(light.id + '-glass', 'powPale', x, y, z, .085, .085, .085,
        [1.08, .90, .59, light.on ? .8 : 0]);
    }
    return definitions;
  }

  function signature(game, q) {
    const s = game.pow, r = s.river || {}, b = s.base, p = game.evade.p;
    const local = q === 0 ? ':' + Math.floor((p[0] - b[0]) / 12) + ':' + Math.floor((p[2] - b[2]) / 12) : '';
    return s.stage + ':' + b.join(',') + ':' + q + ':' + (r.segment || 0) + ':' + (r.phase || '')
      + ':' + !!s.flags?.doorOpen + local;
  }
  function enter(game) {
    if (!active(game)) return false;
    state(game);
    const q = quality(game), key = signature(game, q), old = cache.get(game), geometry = game.campGeo || [];
    if (old && old.key === key && old.geometry === geometry
      && geometry.filter(g => g.id?.startsWith(PREFIX)).length === old.count) return true;
    const originals = geometry.filter(g => !g.id?.startsWith(PREFIX));
    // Retain every original object, including current door/river transformations.
    game.campGeo = originals;
    const localLights = lights(game), defs = blueprints(game, localLights), e = game.evade.p, b = game.pow.base;
    defs.sort((a, z) => {
      const d = Math.hypot(a.x + b[0] - e[0], a.y + b[1] - e[1], a.z + b[2] - e[2]);
      const f = Math.hypot(z.x + b[0] - e[0], z.y + b[1] - e[1], z.z + b[2] - e[2]);
      return d - f || a.id.localeCompare(z.id);
    });
    const selected = defs.slice(0, q === 0 ? LOW_DETAIL : MAX_DETAIL);
    for (const d of selected) P.addBox(game, d.id, d.mesh, d.x, d.y, d.z, d.hx, d.hy, d.hz,
      { solid: false, tint: d.tint, yaw: d.yaw });
    cache.set(game, { key, geometry: game.campGeo, count: selected.length });
    return true;
  }
  function step(game, dt) {
    if (!active(game) || game.paused || !Number.isFinite(dt) || dt <= 0) return false;
    state(game).clock += Math.min(dt, .1); enter(game);
    const light = lights(game).find(l => l.kind === 'searchlight');
    if (light) {
      const hood = game.campGeo.find(g => g.id === PREFIX + light.id + '-hood');
      if (hood) hood.y = Math.atan2(light.direction[0], -light.direction[2]);
    }
    return true;
  }
  function renderState(game) {
    if (!active(game)) return null;
    const s = game.pow, e = state(game), day = daylight(game), river = s.stage === 'river', r = s.river || {};
    const rain = clamp(finite(r.rain, game.atm?.wet ? .5 : 0), 0, 1), indoor = s.stage === 'cell';
    const blend = (night, sunlight) => night.map((v, i) => v + (sunlight[i] - v) * day);
    return {
      profile: indoor ? 'worn-prison-plaster' : s.stage === 'compound' ? 'prison-rooftops' : river ? 'muddy-river' : 'hanoi-street',
      ambient: blend(indoor ? [.08, .105, .13] : [.105, .14, .19], indoor ? [.27, .28, .25] : [.48, .47, .43]),
      rim: blend([.13, .18, .25], [.08, .10, .12]),
      fogColor: blend([.12, .17, .21], [.47, .50, .45]),
      fogDensity: indoor ? .001 : river ? .0027 + rain * .0014 : .0020 + rain * .0008,
      material: { grain: quality(game) === 0 ? .08 : .15, wear: indoor ? .60 : river ? .24 : .43,
        wetness: river ? .55 + rain * .4 : s.stage === 'hanoi' ? .28 + rain * .4 : rain * .3 },
      water: { enabled: river, level: finite(r.waterY, s.base[1]), time: e.clock,
        current: river ? finite(r.currentWorldMps, finite(r.current, .8)) : 0,
        amplitude: river ? .045 + rain * .045 + (r.phase === 'gulf' ? .05 : 0) : 0,
        rgb: blend([.09, .14, .16], [.24, .27, .19]) },
      lights: lights(game)
    };
  }
  function lightAt(game, point, options) {
    if (!active(game)) return 0;
    const p = vec(point, null); if (!p) return 0;
    const requireLOS = !options || options.requireLOS !== false;
    if (requireLOS && !P.los) return 0;
    let total = 0;
    for (const light of lights(game)) {
      if (!light.on || light.intensity <= 0) continue;
      const delta = p.map((v, i) => v - light.position[i]), d = Math.hypot(...delta);
      if (d >= light.radius) continue;
      let cone = 1;
      if (light.direction && d > .001) {
        const dot = delta.reduce((sum, value, i) => sum + value / d * light.direction[i], 0);
        cone = clamp((dot - light.coneCos) / (1 - light.coneCos), 0, 1);
        if (cone === 0) continue;
      }
      if (requireLOS && !P.los(game, light.position, p)) continue;
      total += light.intensity * Math.pow(1 - d / light.radius, 2) * cone;
    }
    return clamp(total, 0, 1);
  }
  function setLamp(game, id, on) {
    if (!active(game) || !LAMP_IDS.includes(id) || typeof on !== 'boolean') return false;
    state(game).lamps[id] = on;
    const glass = game.campGeo?.find(g => g.id === PREFIX + id + '-glass');
    if (glass) glass.t[3] = on ? .8 : 0;
    return true;
  }
  function switchLamp(game, id) {
    if (!active(game) || !LAMP_IDS.includes(id)) return false;
    return setLamp(game, id, !state(game).lamps[id]);
  }
  // Imagined activities change the render scene, not the prison's saved lamps.
  function snapshot(game) { return game && game.pow && game.pow.episodeScene ? copy(state(game)) : null; }
  function restore(game, saved) {
    if (!game || !game.pow) return false;
    const e = state(game);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || saved.version !== 1) return false;
    e.clock = clamp(finite(saved.clock, e.clock), 0, 1e7);
    for (const id of LAMP_IDS) if (typeof saved.lamps?.[id] === 'boolean') e.lamps[id] = saved.lamps[id];
    cache.delete(game); enter(game);
    return true;
  }
  const Scene = P.EpisodeScene = { active, enter, step, renderState, lightAt, setLamp, switchLamp, snapshot, restore,
    constants: Object.freeze({ maxDetail: MAX_DETAIL, lowDetail: LOW_DETAIL, maxLights: 4, geometryPrefix: PREFIX }),
    lampIds: LAMP_IDS };
  if (!P.Scene) P.Scene = Scene;
})(typeof window !== 'undefined' ? window : globalThis);
