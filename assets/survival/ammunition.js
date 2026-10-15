/* Carried .38 ammunition accounting. The A-6A itself has no internal gun.
   Inventory is still changed by the existing game; this module only records
   accepted, completed changes and never grants ammunition or a hit. */
(function (global) {
  'use strict';
  const events = new WeakMap();
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const count = value => integer(value) ? value : 0;
  const add = (a, b) => Math.min(Number.MAX_SAFE_INTEGER, count(a) + count(b));
  const score = game => game && game.world && game.world.score;

  function counters(source) {
    source = source || {};
    // Older checkpoints may contain the total without the two event classes.
    const shots = integer(source.pistolShots) ? source.pistolShots : count(source.bulletsExpended);
    const narrative = count(source.narrativeRoundsExpended);
    return { bulletsExpended: add(shots, narrative), pistolShots: shots,
      narrativeRoundsExpended: narrative, roundsAcquired: count(source.roundsAcquired) };
  }

  function apply(game, data) {
    const target = score(game);
    if (!target) return false;
    for (const key of Object.keys(data)) target[key] = data[key];
    return true;
  }

  function fired(game, evader, before) {
    const target = score(game);
    if (!target || !evader || !integer(before) || before < 1 ||
      !integer(evader.rounds) || evader.rounds !== before - 1 ||
      evader.weaponMode !== 'pistol' || !evader.drawn || evader.hasPistol === false ||
      !Number.isFinite(evader.lastShot)) return false;
    const previous = events.get(evader) || {};
    // Re-rendering, duplicate notifications and a held trigger cannot count
    // the same accepted shot twice. The weapon's existing cooldown owns time.
    if (previous.shotTime === evader.lastShot) return false;
    previous.shotTime = evader.lastShot;
    events.set(evader, previous);
    const data = counters(target);
    data.pistolShots = add(data.pistolShots, 1);
    data.bulletsExpended = add(data.pistolShots, data.narrativeRoundsExpended);
    return apply(game, data);
  }

  function narrativeDelta(game, evader, before) {
    const target = score(game);
    if (!target || !evader || !integer(before) || !integer(evader.rounds)) return false;
    const delta = evader.rounds - before;
    if (!delta) return false;
    const previous = events.get(evader) || {};
    const time = Number.isFinite(game.t) ? game.t : null;
    if (previous.narrativeBefore === before && previous.narrativeAfter === evader.rounds &&
      previous.narrativeTime === time) return false;
    previous.narrativeBefore = before;
    previous.narrativeAfter = evader.rounds;
    previous.narrativeTime = time;
    events.set(evader, previous);
    const data = counters(target);
    // First-contact text can describe firing two rounds. Keep that separate
    // from physical trigger shots so the report does not invent gameplay.
    if (delta < 0) data.narrativeRoundsExpended = add(data.narrativeRoundsExpended, -delta);
    else data.roundsAcquired = add(data.roundsAcquired, delta);
    data.bulletsExpended = add(data.pistolShots, data.narrativeRoundsExpended);
    return apply(game, data);
  }

  function view(game, evader) {
    evader = evader || game && game.evade;
    const data = counters(score(game));
    data.remaining = evader && evader.hasPistol !== false ? count(evader.rounds) : 0;
    data.hasPistol = !!(evader && evader.hasPistol !== false && !evader.camp && !evader.river);
    return data;
  }

  function snapshot(game) {
    return Object.assign({ version: 1 }, counters(score(game)));
  }

  function restore(game, saved) {
    if (!saved || saved.version !== 1 ||
      !['bulletsExpended', 'pistolShots', 'narrativeRoundsExpended', 'roundsAcquired']
        .every(key => integer(saved[key])) ||
      saved.bulletsExpended !== add(saved.pistolShots, saved.narrativeRoundsExpended)) return false;
    // Restore only this ledger. Captivity still confiscates the revolver and
    // its rounds; these statistics never restore carried equipment.
    return apply(game, counters(saved));
  }

  global.SurvivalAmmunition = Object.freeze({ fired, narrativeDelta, view, snapshot, restore });
})(window);
