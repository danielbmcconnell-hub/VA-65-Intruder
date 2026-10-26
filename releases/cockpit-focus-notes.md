# Clear cockpit, branched jungle and parachute threats

[Download the private complete game](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/cockpit-focus-site.zip) (GitHub sign-in required).

Your original jungle photographs guide the new broadleaf sprigs and coconut fronds. Their source paths and hashes are recorded in [component provenance](../assets/jungle/components-provenance.json). The original photographs remain unchanged. The new transparent components are generated artwork, with complete PNG sources and lossless WebP runtime derivatives preserved.

Nearby hardwoods now have asymmetric forks, visible branches and layered leaves at fixed world orientations. Palms have curved trunks and drooping radial fronds; bamboo uses multiple culms and pointed leaves. Loading and failed-photo fallback trees also use branches and individual leaves. Carrier and recovery scenery now use the same botanical rendering path. Distant trees still use bounded photographic detail levels; terrain and some authored scenery remain procedural.

In flight, **COCKPIT** opens the utility controls. **Guidance** keeps its saved preference; **Guide details** opens the longer explanation when needed. Menus and guides close through their toggle or Escape. The normal pilot view keeps its forward area clear. B/N panels fit between navigation, armament and the radar disk. Critical damage and threat warnings retain their instructions. Mission demonstrations keep a short **WIN**, actual progress and **Next** action beside **Pause**, **Take** and **Stop**; **GUIDE** opens the route explanation.

Mission cues now distinguish reconnaissance from attacks, required targets from bonus targets, an achieved objective from an empty weapon rack, and remaining anti-radiation missiles from expended bombs. Recovery is still required where the original mission rules require it. Routine crew feedback is brief and yields to incoming radio and critical damage calls.

During parachute descent, nearby armed positions can acquire and fire on either aviator after the canopy opens. Photographic gunmen, muzzle flashes, tracers and short warnings reveal the threat. Range, facing, terrain and buildings govern shots; steering away and landing behind cover can break contact. Injuries carry into the ground phase, and surviving gunmen become normal nearby enemies. This adds risk without guaranteeing a hit on every descent.

[Verification records](cockpit-focus-tests.json) · [Exact runtime manifest](cockpit-focus-build-manifest.json) · [Seven reviewed native images](cockpit-focus-screenshots/).

| Recorded scope | Result |
| --- | --- |
| Complete CPU runner | 1,131 passing cases across 94 programs; no failures, skips or cancellation |
| Native cockpit HUD | 24 desktop/phone checks, including original input, live scroll and actual instrument bounds |
| Native tutorial UI | 16 checks, all 12 mission previews, actual launch, Scope, Guide, Pause/Take/Stop |
| Ordinary foliage | 22 native deck, flight, B/N, chute, landing, forest and look-up views |
| Crew/damage feedback | 14 native checks; visible warning yields the routine canvas footer |
| Descent threat | 2 native profiles with unobscured actual firing owners, tracers, bounded injuries and pause |
| Original mission demonstrations | All 12 normal successful outcomes; 44 mission/UI/storage checks |
| Exact packaged game | 29 checks; all 319 runtime files served with exact hashes |

The mission replay fast-forwards original simulation after native WebGL startup; it does not grant mission success or represent full-speed movie playback. Its original result retains 42 passing checks and two obsolete assumptions that GUIDE starts open. Those two disclosure checks were independently repeated with native open/close/reopen actions on identical runtime bytes; the [original report](cockpit-focus-missions-original.json) remains unchanged. The descent fixtures deliberately use seed 1 to exercise an earned hit, so they do not establish population hit frequency.

Final runtime source is `4f90c4f020f84896779acacbf1a3be4d0df4a3b8`. Final CPU, HUD, tutorial, foliage, descent, mission and package source hashes match the recorded files. The feedback run predates only the preference-button dispatch guard; all four feedback files and the canvas cue fix are unchanged. Final HUD/tutorial/package runs cover that guard. [Source coverage](cockpit-focus-source-coverage.json) records this distinction. Earlier failed runs remain diagnostics.

Chromium phone-layout checks use the actual WebGL2 renderer but do not establish physical iPhone Safari performance. The update improves branch shapes, materials and screen layout; it does not make every scene a photograph or establish movie-quality frame rates on every device. These checks cover the named suites, not the entire browser registry.

The local complete ZIP is 228,798,693 bytes with SHA256 `d17caaab763a67600a04100d0d08d24f905d1d76471659c1811777439f98acc6`. GitHub generates a different archive wrapper. All 799 protected media/archive blobs, 81 prior remote records and the earlier Jungle Training ZIP are preserved. No public site deployment is included.

Extract the complete game, serve the folder containing `index.html` and `assets/` with `python3 -m http.server 8080`, and open `http://localhost:8080`. The earlier [jungle training release](jungle-training-notes.md) remains available.

Runtime-only commit `beb39415dc7f4e60be3cdb9220467fc0c3eb9046` has the tested runtime source as its sole parent. The `cockpit-focus-playable` tag marks the source documentation release. [Local delivery integrity](cockpit-focus-delivery.json) records the exact ZIP, CRC, source tree, protected media and previous release checks.
