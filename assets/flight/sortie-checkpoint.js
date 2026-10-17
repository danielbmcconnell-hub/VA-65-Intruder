/* A POW checkpoint still belongs to the sortie the player actually flew.
   This is recorded context for the existing objective/debrief code, not a
   second flight save or a source of weapons, target hits or success events. */
(function (root) {
  'use strict';
  const MAX_TARGETS = 64, MAX_CEP = 256, MAX_COUNT = 1000000;
  const countKeys = ['hits', 'misses', 'dropped', 'killed', 'total', 'armsReleased', 'trucks'];
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === null ||
      Object.prototype.toString.call(value) === '[object Object]' && Object.getPrototypeOf(Object.getPrototypeOf(value)) === null);
  const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT;
  const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 80;
  const id = value => typeof value === 'string' && /^(?:m(?:[1-9]|10|11)|free|willard)$/.test(value);
  const originalTargets = game => game && game.world && Array.isArray(game.world.targets)
    ? game.world.targets.filter(target => target && !target.bonus) : null;

  function valid(data) {
    if (!plain(data) || data.version !== 1 || !id(data.missionId) || !text(data.missionType) ||
      !plain(data.score) || !countKeys.every(key => integer(data.score[key])) ||
      !finite(data.score.damage, 0, 10000) || typeof data.score.discipline !== 'boolean' ||
      !Array.isArray(data.score.cep) || data.score.cep.length > MAX_CEP ||
      !data.score.cep.every(value => finite(value, 0, 10000000)) ||
      !Array.isArray(data.targets) || data.targets.length > MAX_TARGETS ||
      !plain(data.stores) || !['bombs', 'bombsMax', 'arms', 'armsMax'].every(key => integer(data.stores[key])) ||
      data.stores.bombs > data.stores.bombsMax || data.stores.arms > data.stores.armsMax ||
      data.score.dropped > data.stores.bombsMax || data.score.armsReleased > data.stores.armsMax ||
      !plain(data.context) || !['captured', 'ejected', 'outOfAircraft', 'departed', 'rightSeat', 'onDeck', 'aircraftAlive', 'hurt']
        .every(key => typeof data.context[key] === 'boolean') ||
      ![null, 'farmer', 'militia'].includes(data.context.blood) ||
      !integer(data.context.crewHits) || !plain(data.context.crew) ||
      !['pilot', 'bn'].every(key => finite(data.context.crew[key], 0, 1)) ||
      !plain(data.navigation) || !integer(data.navigation.fixes) || !integer(data.navigation.routeIndex) ||
      !(data.navigation.errorAtRelease === null || finite(data.navigation.errorAtRelease, 0, 10000000))) return false;
    if (!data.targets.every(target => plain(target) && text(target.kind) && text(target.mesh) &&
      finite(target.hp0, .000001, 100000) && finite(target.hp, -100000, 100000) &&
      typeof target.alive === 'boolean' && typeof target.ident === 'boolean' &&
      (target.alive ? target.hp > 0 : target.hp <= 0))) return false;
    // A saved counter cannot turn a surviving target into an unrecorded kill.
    return data.score.killed === data.targets.filter(target => !target.alive).length &&
      data.score.total === data.targets.length;
  }

  function snapshot(game) {
    const targets = originalTargets(game), w = game && game.world, m = game && game.mis, ac = game && game.ac;
    if (!targets || !w.score || !m || !ac || !id(m.id) || targets.length > MAX_TARGETS) return null;
    const source = w.score, score = {};
    for (const key of countKeys) score[key] = source[key] === undefined ? 0 : source[key];
    score.damage = source.damage === undefined ? 0 : source.damage;
    score.discipline = source.discipline !== false;
    score.cep = Array.isArray(source.cep) ? source.cep.slice() : [];
    const armsMax = integer(game.armsMax) ? game.armsMax :
      m.type === 'ironhand' ? 2 : 0;
    const data = { version: 1, missionId: m.id, missionType: m.type,
      score,
      targets: targets.map(target => ({ kind: target.kind, mesh: target.mesh,
        hp0: target.hp0, hp: target.hp, alive: !!target.alive, ident: !!target.ident })),
      stores: { bombs: ac.bombs, bombsMax: game.bombsMax, arms: ac.arms, armsMax },
      context: { captured: !!game._capt, ejected: !!game.ejected,
        outOfAircraft: !!game._outOfAircraft, departed: !!game.departed, rightSeat: !!game.rightSeat,
        onDeck: !!ac.onDeck, aircraftAlive: !!ac.alive, hurt: !!game._hurt,
        blood: game._blood || null, crewHits: ac.crewHits || 0,
        crew: { pilot: ac.crew && ac.crew.pilot === undefined ? 1 : ac.crew ? ac.crew.pilot : 1,
          bn: ac.crew && ac.crew.bn === undefined ? 1 : ac.crew ? ac.crew.bn : 1 } },
      navigation: { fixes: w.nav && w.nav.fixes || 0, routeIndex: w.rtIdx || 0,
        errorAtRelease: Number.isFinite(w.navErrAtRelease) ? w.navErrAtRelease : null } };
    return valid(data) ? data : null;
  }

  function missionId(savedPOW) {
    return plain(savedPOW) && savedPOW.version === 2 && valid(savedPOW.sortie)
      ? savedPOW.sortie.missionId : null;
  }

  function restore(game, data) {
    const targets = originalTargets(game), w = game && game.world, m = game && game.mis, ac = game && game.ac;
    if (!valid(data) || !targets || !w.score || !m || !ac ||
      m.id !== data.missionId || m.type !== data.missionType || targets.length !== data.targets.length ||
      game.bombsMax !== data.stores.bombsMax ||
      (integer(game.armsMax) ? game.armsMax : m.type === 'ironhand' ? 2 : 0) !== data.stores.armsMax ||
      data.navigation.fixes > (Array.isArray(w.route) ? w.route.length : 0) ||
      data.navigation.routeIndex > (Array.isArray(w.route) ? w.route.length : 0) ||
      !targets.every((target, index) => target.kind === data.targets[index].kind &&
        target.mesh === data.targets[index].mesh && target.hp0 === data.targets[index].hp0)) return false;
    // Validate the entire record before changing any state. Primary targets
    // retain this newly generated world's placement and existing radar alias.
    for (const key of countKeys) w.score[key] = data.score[key];
    w.score.damage = data.score.damage; w.score.discipline = data.score.discipline;
    w.score.cep = data.score.cep.slice();
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index], saved = data.targets[index];
      target.hp = saved.hp; target.alive = saved.alive; target.ident = saved.ident;
      target.burn = saved.alive ? 0 : 1;
    }
    game.bombsMax = data.stores.bombsMax; game.armsMax = data.stores.armsMax;
    ac.bombs = data.stores.bombs; ac.arms = data.stores.arms;
    game._capt = data.context.captured ? 1 : 0; game.ejected = data.context.ejected;
    game._outOfAircraft = data.context.outOfAircraft; game.departed = data.context.departed;
    game.rightSeat = data.context.rightSeat; game._hurt = data.context.hurt; game._blood = data.context.blood;
    ac.onDeck = data.context.onDeck; ac.alive = data.context.aircraftAlive;
    ac.crewHits = data.context.crewHits; ac.crew = Object.assign({}, ac.crew || {}, data.context.crew);
    if (w.nav) w.nav.fixes = data.navigation.fixes;
    w.rtIdx = data.navigation.routeIndex;
    if (data.navigation.errorAtRelease === null) delete w.navErrAtRelease;
    else w.navErrAtRelease = data.navigation.errorAtRelease;
    return true;
  }

  root.FlightSortieCheckpoint = Object.freeze({ snapshot, restore, missionId });
})(window);
