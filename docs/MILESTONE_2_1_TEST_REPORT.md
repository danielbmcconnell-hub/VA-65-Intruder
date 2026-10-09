# Milestone 2.1 · test report

Game-source commit: **83c6eb973cdbac19b077403f7532761e02695d97**. Deployment ZIP SHA-256: **801e271ff0d0453bd81315d2491a7a6c93be1bb72bae576745cff864076198c8**.

This milestone extends the existing custom WebGL2 game. It preserves the A-6A flight simulation, eleven missions, photographic atlases, earlier POW progression and William S. McConnell's tribute photographs. Stage commits are `a3beecc` (Denton/Stockdale photographs and history controls) and `b66e20b` (new captivity modules and their tests); the source commit above records the final tested integration.

## Playable changes

- The unchanged Denton and Stockdale PNGs appear in history and captivity. The optional, dated May 2, 1966 Denton flashback teaches decoding the visible Morse signal TORTURE. It uses a static photograph and a separate authored signal, without claiming authentic film or verified blink timing.
- Physically separated schematic cells and a progressive counted-tap course reveal remembered identities, support, leadership guidance and a fictional guard-routine clue. Early contact remains anonymous. BACK US matching and supportive decisions, family memories, the Scout Oath/Law and optional reflection reward practice without judging courage, forced compliance or religious belief.
- First-person imagined engine, house and city projects require walking to components, samples and plots, dependency choices and recall. House walls collide with the player. Returning or saving preserves the physical cell, guards and remembered projects.
- An escorted return to regular imprisonment requires elapsed confinement, completed activities, communication, condition and observations on different days. The new camp has four moving guards, supervised yard hours, concealed tool work, a workshop lock, three separately worked hatch fasteners and an outer gate. Crossing its boundary through actual movement returns to existing Hanoi gameplay. Sight/noise can provoke investigation and pursuit; sustained contact causes recapture. Checkpoints preserve progression and restored attempts begin with secure barriers.

## Verification status

**231 browser checks passed:** 166 existing regressions, 57 complete integrated M2.1 checks and 8 new recapture checks. Five additional packaged-build checks passed, verifying all 54 runtime files and fresh-default flight/POW startup in both layouts. No partial or failed run contributes to the passing total.

| Suite | Checks | Result / evidence |
| --- | ---: | --- |
| Existing renderer / missions / progression | 6 / 22 / 26 | Passed; `test-results/m21-regression/` |
| Existing ground / photographs | 11 / 33 | Passed; photos include desktop, phone landscape and portrait |
| Existing prison / river / captivity | 19 / 14 / 15 | Passed |
| Existing controls / countryside awareness | 14 / 6 | Passed |
| New regular-camp pursuit, recapture and checkpoint encounters | 8 | Passed; `test-results/m21-final/m21-recapture.json` |
| New complete integrated M2.1 sequence | 57 | Passed in both layouts; `test-results/m21-final/m21.json` and `pow-m21/results.json`; no recorded browser errors |
| Exact packaged build | 5 | Passed; all 54 runtime hashes, flight launches, eight historical photos and checkpoints in both layouts. |

**133 Node/VM checks passed:** 67 earlier simulation checks plus solidarity 23, Morse 15, mindscape 10 and regular confinement 18. The Morse 15 include a recorded DOM/lifecycle fixture; they do not establish a browser render. Actual visible pulse decoding is exercised separately by the integrated browser suite. Original asset checks protect flight/mission/model source and photographs/atlases; the eight displayed historical images match their supplied source bytes, including both new PNGs.

Browser runs use actual Chromium WebGL2 with a software GPU, desktop and emulated phone layouts. Tests execute real rendering, DOM controls, pulse counting, project decisions, collision, held interactions and checkpoint restoration. Deterministic view steering and calendar advancement are declared fixtures. The successful camp route moves patrol duty homes away after separately checking live patrol movement and investigation; it does not establish that the unaltered patrol schedule is easy for a human. Separate near-player guard fixtures exercise live vision, pursuit, collision and sustained-contact recapture. Success flags and gameplay methods are not substituted. Phone-layout movement still uses injected keyboard input in portions of the route; touch holds and earlier touch-control suites provide separate touchscreen coverage. Mission checks load and launch all eleven missions; they are not human completion of every combat sortie.

## Corrections found during integration

Actual browser testing exposed an undefined `expected` value in the new tap-transmission hook; notification now occurs only after validated transmission. Closing captivity/history/imagined panels now clears stale focus and held controls so hidden dialogs cannot block first-person input. Imagination checkpoints retain physical surroundings, and eligible transfer no longer competes with the old door interaction. Regular-camp guards remember visible escape activity after the player briefly returns to a permitted area. Visual review also reduced overbright imagined-room lighting and folded instructions into a compact panel so the phone view remains usable; city tools stay hidden in the engine and house.

Testing also corrected fixtures: approach walking now reaches the exact intended interaction rather than stopping within an overlapping object's range; the house-wall check starts from a clear aisle rather than colliding first with the correctly solid sink. Corridor observations handle a pending interview and inspect again on a different day; real sleep recovers fatigue before demanding projects. These fixture changes are not counted as gameplay repairs. The affected suites passed on rerun; the complete 57-check M2.1 chain passed again after the lighting and compact HUD changes. Existing flight source remained byte-for-byte protected throughout. Suite timestamps and individual source hashes record the incremental runs; this was not one uninterrupted all-suites command.

## Limits and device trial

Physical Windows Chrome and iPhone Safari, hardware frame rates, long suspension, rotation/safe areas, available speech voices and human difficulty balance remain unverified. These additions use schematic environments and the existing photographic gait artwork; they do not supply new fully articulated photographic animation poses.

The [historical audit](MILESTONE_2_1_HISTORICAL_SOURCES.md) identifies three substantive Smithsonian pages actually read and blocked or unresolved archival/interview sources. The Gemini Coker summary remains secondary inspiration. Cells, exact adjacency, messages, schedules, project rules, condition scores, transfers and successful escapes are fictional. The approximate three-by-nine-foot cell differs from Smithsonian's four-by-nine-foot description for Sam Johnson. Color-photo provenance, reproduction rights and exact firsthand BACK US wording are unresolved; no invented authentic POW quotations are used. Coker and U.S. Air Force Captain George G. McKnight's October 12, 1967 escape ended in recapture; successful game endings remain alternate history.

On Windows and iPhone, check photographs and text wrapping; audio and voices; mouse look or left-stick/right-look controls; held F/Interact and release between actions; Morse/tap timing; all imagined projects and return/save; different-day observation; regular-camp patrols, walls and locks; pursuit/recapture; save/reload; and suspension/rotation. Use the [play guide](MILESTONE_2_1_PLAY_GUIDE.md) and [Netlify instructions](NETLIFY_DEPLOYMENT_MILESTONE_2_1.md). This delivery does not change the existing live Netlify site.

Reproduction: activate `.venv` before `npm run test:assets`, `npm run test:pow`, `npm test`, `npm run test:m21`, `npm run build`, then `npm run test:build`. Individual browser suites use `node tests/run-browser.cjs --suite=<name>`. Evidence reports and actual WebGL screenshots accompany the release separately from the runtime ZIP.
