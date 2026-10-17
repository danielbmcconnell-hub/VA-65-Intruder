# Willard Egress — implementation and verification report

Willard Egress adds an unlocked twelfth mission to the complete existing game: optional night bombing, a pursuing interceptor, manual defensive flight, hostile ground-fire disruption and a conditional coastal escape. It uses the existing custom WebGL2 renderer and A-6A flight simulation. [Play guide](WILLARD_EGRESS_PLAY_GUIDE.md).

Implemented on the dedicated `willard-egress` branch, preserving the complete original history and earlier releases. Source commit: `0265c3ff796f0db2a1e965a13600ae4cca8546df`. The record below distinguishes full-flight acceptance, isolated fixtures, incremental older regressions and final packaged verification.

## Implementation

| Files | Responsibility |
| --- | --- |
| `assets/willard/mission.js` | Five phases, mission definition/briefing, scenery, B/N guidance, validated separate checkpoints, accumulated retry penalties, outcomes, scoring, debrief and optional original carrier recovery. Mission-only wrappers delegate earlier missions to their original methods. |
| `assets/willard/interceptor.js` | Bounded movement/energy, visual perception and last-known-position memory, interception, pursuit, finite cannon bursts/projectiles, overshoot/reposition/reacquisition, flak evasion and disengagement. |
| `assets/willard/flak.js` | Eight fixed hostile emplacements, delayed observations, limited gun slew, predictive aim, ballistic fuse shells, spatial burst damage, searchlights and bounded effects. Both aircraft remain vulnerable. |
| `assets/willard/sprites.js` | Parses the supplied atlas metadata; renders actual world-positioned artwork through dedicated WebGL2 sprite shaders, perspective size, correct pivots/aspects, depth testing and state restoration. |
| `assets/willard/presentation.js`, `presentation.css` | Mission/threat/navigation display, rear camera controls, released-touch handling, safe-area layout and a bounded synthesized/spatial pursuit sound graph with lifecycle cleanup. |
| `assets/willard/media/` | Supplied atlas PNG/JSON, 54 individual PNG frames and original accompanying preview/demo/reference materials. Deployment includes runtime images and metadata through an explicit allowlist. |
| `index.html` | Additive module loading, selector entry, manual pilot start, mission-only Rookie assistance, rear camera, night lighting, actual interceptor drawing, neutral dramatized radio attribution and HUD integration. |
| `assets/flight/sortie-checkpoint.js` | Recognizes Willard's mission ID when preserving original sortie context through POW saves. Existing missions retain their validation. |
| `tests/willard-*.cjs` | Asset/orientation, AI, gun, presentation/audio, mission, real-browser gameplay and real-GPU verification. |
| `tests/mission-browser.cjs`, `tests/flight-coach-browser.cjs` | Keep original-eleven mission checks scoped to those missions when the additive twelfth selector entry exists. |
| `tests/build-browser.cjs`, `tests/run-browser.cjs`, `package.json`, `tools/package-build.cjs` | Register tests, include the complete runtime and verify the packaged mission. |
| `docs/WILLARD_EGRESS_*.md` | Historical boundaries, playing instructions and this report. |

No aircraft gun is added. The original attack computer, bombs, damage/crew system, terrain collision, ejection, survival, rescue and POW mechanics remain authoritative. Willard has a finite 180-round interceptor cannon supply; its projectile collisions produce actual original aircraft damage. The ground guns create physical shells and timed bursts, not scripted player damage or a friendly corridor.

Mission progress requires aircraft movement and combat conditions. Timings introduce phase guidance but cannot alone break pursuit or win. Safe egress requires earned disruption/alternate evasion, adequate separation, the sea approach, an intact aircraft and two living crew. An optional carrier result additionally requires the original on-deck and arresting-wire state. Corrupt checkpoint data is rejected before restoration or replacement of a valid save.

## Actual verification record

Passing reruns replace earlier attempts; failed development runs do not count as passes. Source-browser tests use Linux Chromium with SwiftShader WebGL2, including an 844×390, DPR 3 touch-emulated iPhone layout. They are not tests on physical Windows or iPhone Safari.

| Checks | Completed verification |
| --- | --- |
| Supplied sprite bytes/pixels, atlas frames/pivots and orientation geometry | **23 passed** |
| Interceptor mechanics | **27 passed** |
| Hostile gun/shell/damage mechanics | **24 passed** |
| Presentation, touch-release and Web Audio lifecycle fixtures | **30 passed** |
| Mission, checkpoint corruption, death/crew gates and earlier-method delegation | **28 passed** |
| New Node/VM/domain total | **132 passed** |
| Existing Node/VM/domain suite | **396 passed**; all 30 old/new domain suites total **528** |
| Frozen-source integrated Willard browser gameplay | **34 passed**, 17 per layout |
| Real WebGL2 MiG sampling, perspective, alpha/depth/aspect and lifecycle | **14 passed**, seven per layout |
| Earlier source-browser regressions | **520 passed**, 23 distinct suites; reruns replace earlier attempts |
| Capture/retry lifecycle on the final guarded entry | **6 passed**, three per layout |
| Combined source-browser total | **574 passed**, across 26 suites |
| Production ZIP HTTP/hash/native-launch checks | **11 passed**, all 132 runtime hashes/content types plus native packaged launch on both layouts |
| ZIP CRC, complete-runtime allowlist, final hashes and independent download | **Passed** ZIP CRC, exact 132-file allowlist, decoded assets and runtime hashes. Remote transfer is checked separately after publishing the branch. |

The final Willard gameplay report is `test-results/willard-final/willard.json`; its source-hash audit confirms unchanged runtime bytes throughout that run. The GPU report is `test-results/willard-renderer-current/willard-renderer.json`. Original regressions and their source-hash records are collected under `test-results/willard-regression/`. Full-flight and GPU acceptance used entry `d1a5b4…`; the final entry adds only two prison callback ownership guards. Final renderer/progression, targeted capture lifecycle, combat captures and packaged checks cover that guarded entry. Do not describe every incremental check as having run on identical final bytes. Completed reports and their hashes are retained in the evidence ZIP.

### Full-sortie gameplay evidence

Both layouts launched through the normal selector and native PLAY button. A deterministic automated pilot then commanded normalized stick/throttle inputs and stepped the original `Game.update`/`acStep` at 1/60 second. It followed the available B/N navigation guidance with defensive variations while original terrain, fighter perception, rounds, flak collisions, damage and victory conditions stayed active.

The test declares repeatable uniform randomness and a briefly fixed construction seed, then restores the normal wall clock. This controls variation without replacing damage probabilities. It does **not** teleport the aircraft, change a phase/outcome, force the MiG to disengage or award a hit, kill or win. This is automated control verification, not a human playthrough.

The desktop standard run reached safe egress at **493.45 simulated seconds**, with 17 cannon and 12 flak hits recorded; both crew survived. The touch-layout run finished at **509.87 seconds**, with 14 cannon and 12 flak hits; both crew survived. Both registered an actual defensive break and flak-disrupted pursuit, with no terrain-escape shortcut. These runs establish one reproducible standard-difficulty success per layout, not balance across every seed or difficulty.

Native mouse/keyboard and CDP touchscreen cases separately checked steering, throttle, rear/chase view, pause/resume, result/HUD/pause retries, reload/Continue, independent Rookie/Ace launch and controls, and a genuine held-input fatal dive. Repeated retries retained one fighter, one control set/update clock and at most two owned pursuit-audio sources. Audio graph checks establish generated signal/lifecycle, not subjective sound quality.

The optional bombing check is a **separate declared run-in/radar-readback fixture**. Native designation and held consent invoke the preserved ASQ-61 release; original ballistic stepping then damages the actual depot. It does not call detonate or assign target HP. The full positive sortie does not require this optional attack.

Ejection/capture checks separately place the aircraft 110 m above suitable dry terrain, use native J/two-tap EJECT, step original parachute/ground transitions, then use actual surrender/captor behavior. A nearby enemy location is declared when needed to isolate capture. The existing solitary scene starts through the original delayed callback; neither a POW stage nor a successful outcome is assigned.

The GPU suite uses explicit camera, aircraft-position and depth-wall fixtures with the supplied atlas. It verifies real framebuffer sampling/occlusion, aspect choice, projected size, restored WebGL state and context/resource behavior. Those captures show rendering, not a separate complete sortie. Three additional captures use native LOOK AFT during another actual input-driven flight: the naturally closing MiG and two fresh hostile flak flashes near Nam Dinh. Searchlight endpoints are outside these camera views; these captures do not demonstrate visible beams. The complete gameplay captures include the initial strike, aft contact, live pursuit, gun-belt approach, earned break, completion, fatal dive, parachute, ground survival and captivity on both layouts.

### Preservation and defects corrected during testing

Original preservation checks protect all eleven mission definitions, complete A-6A physics, original model/markings, family photographs and source atlases. Earlier POW runtime files, including the rooftop rope interaction/descent, are retained. The old mission test checks startup/input-driven launch, not completion of all eleven sorties. Any final-source reruns and earlier-source checks must remain distinguishable in the evidence audit.

A targeted reproduction proved that an abandoned flight’s real 1.8-second capture callback could activate global prison HUD/audio and overwrite its checkpoint after native retry. Restoring ownership checks in both `App.captivity` and `App.cokerCamp` prevents this; the final lifecycle tests also verify current-game capture still creates actual solitary geometry, controls and saves. Its declared capture-entry fixture and ejection placement are separate from natural capture acceptance.

Testing corrected checkpoint recursion/required-field validation, a negative searchlight cursor that could crash restore, invalid-save overwrite, retry penalty reset, premature victory/carrier assertions, stale sortie callbacks, rear-view/H-key conflict, touch-release/deduplication, mission-only crew/radio attribution and audio/resource cleanup. Original mission methods retain fallback delegation.

## Historical and visual limits

The foundation supplied by the user identifies VA-65, USS Constellation, Williams/Diselrod, Nam Dinh and 1966. Independent archival retrieval was blocked, so this release does not claim corroboration of that account. [The historical audit](WILLARD_EGRESS_HISTORY.md) records attempts and qualifications. The unidentified pursuer is represented as MiG-17PF; type, markings, combat, weather, route, defenses, dialogue and outcomes are reconstruction. A simulated fighter loss is not a historical confirmed kill. The tribute to William S. McConnell remains separate.

The intact supplied pack identifies its images as **AI-rendered game artwork**, not archival photographs or verified scale geometry. Its 48 heading/bank frames and six orthographic aspects are rendered as perspective world-space cards; the limited side/front/rear/underside coverage uses authored aspect adaptation and transitions. Crossfading and camera-relative orientation improve continuity, but the pack cannot provide physically exact three-dimensional surfaces at every angle. No generic placeholder aircraft replaces it. Generic NL 502 presentation does not establish an authenticated individual Intruder assignment.

Physical Windows Chrome, actual iPhone Safari/WebKit, hardware 30/60 FPS, rotation/safe-area variations, subjective visual/audio quality and human enjoyment/difficulty remain manual validation. There is no claim of a completed human carrier approach/arrestment; its positive domain test uses the state generated by the existing landing system. Terrain/geography are generated, cloud/visibility and effects approximate, and mobile particle/resource bounds do not establish a measured device performance floor.

## Build, deploy and identifiers

Use `npm run dev` for local HTTP development. `npm run test:willard` runs the new domain and actual-browser suites; `npm test` runs registered browser regressions. `npm run test:assets`, `npm run build` and `npm run test:build` verify preservation, the production runtime folder/ZIP and HTTP/native packaged startup.

The build allowlist includes the complete game and all twelve missions while excluding Git history, reference archives, tooling, node_modules and test evidence. Output is `dist/site/` and `dist/Intruder_Yankee_Station_Willard_Egress.zip`. The source/reference materials and test evidence remain in the private repository separately.

To update the existing Netlify project:

1. Download the delivered runtime ZIP while signed into the private GitHub repository, then right-click it on Windows and choose **Extract All**.
2. In the existing project's **Deploys** page, manually upload the extracted folder whose immediate children are `index.html`, `assets/` and `_headers`.
3. Keep the existing project/domain to preserve the browser save origin. Wait for production publication, reopen the game and confirm the title says **Intruder: Yankee Station — Willard Egress**. Use Ctrl+F5 if needed; avoid clearing site data to retain checkpoints.
4. Launch the new mission and check the earlier prison Continue/rope route, photographs and normal flight controls on your Windows PC and iPhone. Previous Netlify deploys provide rollback.

The live site, [steady-croquembouche-46c1a0.netlify.app](https://steady-croquembouche-46c1a0.netlify.app/), has **not** been redeployed by this Git/file delivery. Static gameplay requires no API key or gameplay backend.

- Branch: `willard-egress`; preserved start tag: `willard-egress-start` → `ed5453be10fa74fc222e12cb7f23d9991a123af4`.
- Tested entry SHA-256: `ac3edb69d5620a9d8e2c68fcb4f01094163f0a4f730f45801d4d4b98444a5323`.
- Mission module SHA-256: `7e2df552017674b8c99f20f2c2da31c61d7d2a0fa24960512d548912c9602a1a`.
- Presentation module SHA-256: `2133a8eb968577a832dcb9735f10764652562c8f916b78109513a6bce822a5b4`.
- Source commit SHA: `0265c3ff796f0db2a1e965a13600ae4cca8546df`.
- ZIP bytes/file count/SHA-256 and direct download: 34,683,110 bytes; **132 runtime files**; SHA-256 `7f75f42cb025f1de583432782398f1688ee3d538e559f091a881359574f1417f`. [Download complete Netlify ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/willard-egress/releases/Intruder_Yankee_Station_Willard_Egress.zip) (private GitHub sign-in required)..
