# Milestone 2.4 release and test report

**520 source-browser checks, 396 Node/VM checks and nine packaged-build checks passed.** The runtime-only Netlify ZIP contains 70 files. Source regressions completed incrementally, with affected final-source reruns. Physical Windows and iPhone Safari remain for device testing.

Milestone 2.4 focuses on the B/N's existing attack workflow, more readable real strike effects and correct survival-ammunition expenditure. It preserves the custom WebGL2 engine, the A-6A flight simulation, mission content, historical/family photography and the functioning POW chapters. [Play guide](MILESTONE2_4_PLAY_GUIDE.md).

## Implemented changes

- **B/N correlation worksheet:** an optional, initially collapsed drawer explains the assigned target's recognition pattern and clearance. Crosshair readback samples the same actual radar buffer, hard-return values and sweep age that the scope displays. It never identifies a hidden world target automatically. Player interpretations can be recorded and reviewed, then the native LOCK button invokes the preserved targeting control at the existing crosshairs.
- **Attack progression:** the drawer follows genuine navigation checkpoints, system error, offset aiming, blind coordinates, ASQ-61 validity/steering, actual stores and attack consent. It retains weapons-tight reconnaissance, carrier practice and the existing A-6B Iron Hand distinction. It hides during pause, graphics-context loss, captivity and menus. It blocks form keyboard/pointer events from leaking into flight weapons controls and keeps existing touchscreen controls clear. Released touch taps activate once even when a preceding radar drag suppresses the browser's compatibility click; scrolls and cancelled touches do not activate buttons.
- **Actual strike effects:** production bomb/ARM impacts add bounded visual dust, spray, smoke and transient light. Only actual destroyed eligible targets schedule delayed, target-specific cook-offs. Fuel, ammunition, vehicles, rolling stock and launchers differ; concrete bridges/radar do not gain fictional fuel explosions. Visual augmentation does not issue weapons, apply extra damage or grant extra kills. Simulation time controls timing and pause. Ejection retires transient strike lights while preserving existing fires, smoke and recorded damage.
- **Ammunition ledger:** accepted carried-revolver shots count once, including misses and blocked shots; cooldown, empty-trigger and non-pistol attacks do not fabricate expenditure. Existing first-contact inventory changes are distinguished from physical trigger shots. Remaining ammunition and total spent appear in the survival HUD. Confiscation preserves expenditure without restoring equipment. Debrief and Cruise Log retain the counters.
- **Separate aircraft-store accounting:** bombs dropped and accepted ARM launches remain distinct. The worksheet totals both as stores expended, labels measured hits/misses as weapon-impact data and does not infer ARM hits from launches. Its observation guidance checks actual missiles in flight.
- **POW sortie context:** new captivity saves retain the original mission identity, recorded target results, aircraft stores, navigation-fix/release-error data and capture/ejection context along with ammunition. Resume validates the entire record against the mission before applying it. This records an existing sortie; it is not a second flight simulation, an airborne save or a way to obtain weapons or successes.

New runtime modules are `assets/survival/ammunition.js`, `assets/flight/strike-board.js`, `strike-board.css`, `strike-effects.js` and `sortie-checkpoint.js`. The entry page integrates them with the existing game, HUD, debrief, input handlers and POW checkpoints.

## Preservation and historical boundaries

**Preservation checks passed.** Protected bytes include the original A-6A physics/model/markings, all eleven mission definitions, family photographs, supplied historical images and source atlases. Prior Milestone 2.3 materials remain in the repository and the existing POW history remains separate from hypothetical gameplay outcomes.

This update introduces no new historical quotation, archival photograph, film or documented event. The worksheet text and recognition sketches are authored game guidance, not reconstructed statements attributed to LTJG William S. McConnell or other real aviators. Particle timing, plume appearance and target cook-off profiles are authored visual approximations. The A-6A has no internal gun; survival pistol rounds and the existing A-6B Iron Hand missile load remain separate capabilities.

## Verification record

Only complete passing reports are counted; reruns replace earlier counts. New acceptance recorded final entry SHA-256 on both layouts. Existing mission-launch checks ran on entry `c631595f…` before the final flash-cleanup-only change. Renderer (6), progression (26) and ground (11) reran on the final entry; flight coaching, onboarding, episode and memory-detail reports also record final source hashes. This is incremental validation, not a claim that every old report used identical bytes. Every packaged runtime byte matches the final tested files.

| Verification | Final status |
| --- | --- |
| Ammunition Node/VM checks executing production weapon methods | 14 passed |
| B/N worksheet domain/DOM checks, including touch-release/dedup | 31 passed |
| Strike-effects Node/VM and production World/FX checks | 24 passed |
| POW sortie-checkpoint validation/restore checks | 15 passed |
| Native Chromium ammunition/capture/restore/report acceptance | 22 passed, 11 per layout |
| Native Chromium B/N designation/release/impact/secondary acceptance | 22 passed, 11 per layout |
| Existing renderer, missions, progression, ground, photos and POW regressions | 476 passed across 21 suites |
| Runtime-only ZIP HTTP/hash/startup verification | 9 passed; all 70 HTTP hashes/MIME types, native guidance/worksheet, fresh flights and POW saves/photos |
| ZIP CRC, allowlist and preservation | Passed; all 70 hashes, unchanged original physics/model/missions/photos/atlases |

### What the new browser tests establish

The ammunition suite uses native keyboard and touch controls with the actual ejection, parachute landing, carried weapon cooldown, inventory and WebGL2 HUD. Declared dry-ground placement and removed countryside encounters isolate ammunition accounting from unrelated random capture. It fires the finite six-round supply, tests dry/non-pistol attacks, triggers the real capture transition, saves, reloads through Continue, checks the original mission context and inspects actual debrief/Cruise Log output. It does not assign shot, hit, rescue or success results.

The B/N strike suite uses native scope drag, player interpretation, NOTE, LOCK and held consent. A short aircraft position/velocity fixture isolates a run-in; original radar painting, targeting, ASQ-61 release, weapon gravity/drag, contact, target damage and secondary scheduling remain real. After release, an explicit weapon/FX clock can isolate the effect from random AAA; the fixture does not call detonate, force a target kill or fabricate a flash. It exercises a genuine depot strike, fuel storage, a ground miss, concrete bridge dust and the existing A-6B ARM radar attack, plus no-error/no-missing-asset checks on both layouts. Its short passes do not establish complete human combat sorties or carrier recoveries.

The worksheet checks explicitly reject omniscient target-array reads for return interpretation, preserve visual-identification and weapons-tight restrictions, use selected-column freshness, delegate unchanged LOCK without snapping or releasing, execute production `World.fireArm` accepted/rejected launches, distinguish mixed bomb/ARM expenditure, and verify form input isolation and hidden-state cleanup. DOM and Node/VM fixtures do not establish GPU correctness or Safari behavior.

The evidence ZIP includes **38 actual browser captures**: 26 new ammunition/strike captures, eight selected preserved prison/river/memory gameplay captures and four packaged startup captures. [Twelve samples](../releases/milestone2_4-screenshots/) show radar correlation, real primary/secondary impacts, bridge dust, ARM impact, ammunition and ejection cleanup. These use the declared placement/clock fixtures; they are not natural full-sortie recordings. All 23 source-browser JSON reports, nine packaged checks, 25 domain logs, preservation and final audit are included.

Reproduce the checks with the established cloud environment: `npm run test:assets`, `npm run test:bn`, the affected original browser suites, `npm run build` and `npm run test:build`. `npm test` includes all registered source-browser suites. Browser tests use the real custom WebGL2 renderer in Chromium/SwiftShader on Linux, with desktop and simulated iPhone layouts; touch cases use native browser input where the reports state it.

### Remaining practical limits

Physical Windows Chrome and iPhone Safari, hardware frame rate, rotation, subjective audio/visual quality and human difficulty or enjoyment are unverified by cloud software rendering and emulation. Complete native human sorties and arrested landings are separate trials from short deterministic attack passes. Weather, distance and the cockpit viewing direction can obscure an explosion; the game does not provide an omniscient attack camera to guarantee a view.

The worksheet records a player's working interpretation, not positive identification. Its temporary notes are not part of the new captivity save. Previously saved logs without ammunition data cannot reconstruct unrecorded shots. New POW checkpoints preserve validated sortie context, while older records remain subject to the existing compatibility fallback. Checkpoints remain local to the same website origin, browser and device.

The visual effects have bounded active targets, event queues, transient lights and particle emission budgets. They are approximate effects, rather than a new physical blast or fire simulation. Their performance still needs actual phone testing. The unchanged countryside vegetation atlas can still look like rough or floating cutouts in some ground views; this update does not claim to repair those legacy assets.

## Update the existing Netlify project

No live deployment is claimed. The existing game address is [steady-croquembouche-46c1a0.netlify.app](https://steady-croquembouche-46c1a0.netlify.app/).

1. Download the completed Milestone 2.4 runtime ZIP from the delivered attachment or private GitHub release/branch. On a GitHub repository file, choose **Download raw file**.
2. On Windows, right-click the ZIP and choose **Extract All**. Upload the extracted runtime folder whose immediate children include `index.html`, `assets/` and `_headers`.
3. In the existing Netlify project's **Deploys** page, use manual deployment for that folder. Keep the project and existing domain to retain the save origin. The source checkout and test-evidence ZIP are not deploy folders.
4. Wait for Netlify to publish the production deployment. Reopen the existing address and confirm the browser title reads **Intruder: Yankee Station — Milestone 2.4**. Use **Ctrl+F5** if Windows still shows the old entry page; `?v=milestone2-4` requests a fresh entry page without changing the save origin. Avoid clearing site data if you want checkpoints retained.
5. Select **Right — B/N**, try DIANE practice, open the worksheet, slew/NOTE/LOCK, and hold consent through a solution. Test the prison Continue entry and photographs as well. On iPhone, begin in landscape on Medium or Low graphics and verify looking, holding/releasing controls, sound and rotation.

Previous Netlify deployments remain available for rollback. The game is a static browser build with no gameplay API key or backend requirement.

## Final release identifiers

- Tested source commit: `184625b75af636dd79554ac1a9c83532f84ea69c`; delivery branch `milestone2-4`.
- Preserved baseline: `10b5e5085ae56a0956dc2ce03aaca75b3f9a34e6`, tag `milestone2_4-start`.
- Runtime entry SHA-256: `95f6e92ad3f4a8112290b27bcb83fe982ed8eb83eff683c8844e61b4d13dd61f`.
- Playable ZIP: [Intruder_Yankee_Station_Milestone2_4.zip](../releases/Intruder_Yankee_Station_Milestone2_4.zip), 23,336,305 bytes, 70 files; SHA-256 `3301d2ff297e842bfb8d35e27bed2cda525cc4b7eb78a63f927710637f6495e0`.
- [Evidence ZIP](../releases/Intruder_Yankee_Station_Milestone2_4_Evidence.zip), [summary](../releases/milestone2_4-summary.json), [manifest](../releases/milestone2_4-build-manifest.json) and [download checksums](../releases/SHA256SUMS.txt).
- Rebuilding after the source commit preserved all 70 packaged/browser-tested runtime hashes.

All prior branches, releases and ancestry, including `5e32916` and `15b0392`, are preserved. The source and delivery commits are transferred on the private `milestone2-4` branch; the final response reports the independent fresh-download verification. The live Netlify site is not changed by this Git transfer.
