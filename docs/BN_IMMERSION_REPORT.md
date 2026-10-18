# B/N Immersion — implementation and verification

The focused pass adds interactive B/N chart/echo correlation and run-in plotting, clearer Willard combat alerts and rear magnification, adjustable night lighting, and recognizable landmarks along the existing route. It preserves the twelve mission definitions, original A-6A aircraft physics/model/markings, weapons, photographs, prior chapters and Git history. [Play guide](BN_IMMERSION_PLAY_GUIDE.md).

## Changed systems

| Files | Result |
| --- | --- |
| `assets/flight/strike-board.js`, `.css` | Public briefing/route chart, independent candidate versus actual radar comparison, uncertainty/freshness handling, advisory run-in plot and measured debrief notes. Original LOCK, steering and release remain authoritative. |
| `assets/flight/route-scene.js` | Ground-supported sidings/wagons/sheds/junction, actual-channel bridge and piers, hamlets and industrial works; warm lamps, distance/quality bounds, saved visibility and a copied Willard night atmosphere. |
| `assets/flight/immersion.js`, `.css` | Native briefing/pause visibility controls; bounded ranking of original strike lights, landmark lamps and genuinely fresh physical flak bursts. No damage, timers or target identities are generated here. |
| `assets/willard/presentation.js`, `.css` | Brief evidence-based cannon/flak/damage alerts; recent-sighting clock direction; optional rear magnification; canonical keyboard/native camera cleanup. Existing four flight controls and bounded audio graph remain. |
| `index.html` | Module/render integration, scoped night fog contrast, actual camera FOV, consistent V/VIEW, and opaque scope rendering corrections. |
| New domain/browser tests; `tests/m24-strike-browser.cjs` | Geometry/budget/state/native input/GPU tests, plus correct silent-emitter ARM re-consent fixture. |
| `package.json`, test runner, package builder | Register the focused tests and include the complete runtime in the new deployment ZIP. No new dependency or engine is introduced. |

The B/N never receives hidden target identity from this chart. Marks are player judgments; COMPARE reads the same actual polar radar cells displayed on the scope. Dark, stale, mismatched and blind returns remain uncertain. Plotting a run-in neither steers nor releases weapons. Existing mission restrictions remain effective.

Night copies and the new fog-contrast uniform are scoped to airborne Willard. The original atmosphere object is unchanged; ordinary day flights, carrier deck views and POW scenes retain their settings. Grounded foundations sample rotated footprints. River crossings are located in the same field used by the terrain shader, with piers supporting the span. Low/Medium/High instance budgets are 120/190/220; the route contributes at most three local lights, and all combined lights stay within four on Low or eight otherwise. GPU meshes are cached per renderer and recreated after context restoration.

## Defects found and addressed

- Willard's legacy `egressCalled` flag incorrectly made the worksheet say stores were expended during its optional four-bomb strike. Guidance now uses the actual Willard phase and retains the previous flag behavior for older missions.
- Global V and legacy VIEW bypassed rear magnification cleanup. All Willard camera actions now use the same helper; ordinary missions retain their original camera behavior.
- Distant night fog inherited a daylight-gray whitening floor. An opt-in night uniform removes that floor using the actual night atmosphere, with an adjustable readable exposure/ambient range.
- Actual native B/N captures exposed a long-standing transparent panel/radar defect. Fresh-context diagnostics isolated inherited symbology shadows combined with nested CRT/fan clips during transparent image copies on the tested Chromium rendering path. Opaque scope drawing now disables that shadow before the outer clip; bitmap drawing also avoids it. The tiny directly written radar raster requests the readback-friendly Canvas2D hint. That hint alone did not fix the defect; the shadow/clip correction is the relevant fix. Final verification checks real panel opacity, returns and repeated native scope transitions.
- A real radar drag could suppress a later compatibility click on the legacy SCOPE button in touch browsers. SCOPE now uses the existing released-touch handler with click deduplication, preserving keyboard and mouse activation.
- An older Iron Hand test incorrectly expected a held consent to fire when a silent radar later emitted. The original A-6B requires a fresh consent edge while emitting. The corrected test first proves no launch during that silent-edge hold, then makes a new native press when the real emitter returns and checks launch, stores and actual radar destruction. Weapon code is unchanged.

## Actual tests

| Verification | Result |
| --- | --- |
| Node/VM domain checks, 34 suites | **598 passed** |
| Selected existing browser regressions: renderer, all 11 earlier mission starts, progression, Willard gameplay/renderer/lifecycle, strikes, ammunition, POW renderer and controls | **180 passed** |
| New native chart/radar checks | **10 passed** |
| New night/landmark/lighting/camera/context checks | **20 passed** |
| Final native opaque radar, returns, drag, cancelled touch and repeated scope transitions | **12 passed** |
| Total selected source-browser checks, 13 suites | **222 passed** |
| Exact final packaged build: 135 HTTP hashes/content types, desktop/touch launches, original flight, POW/photo/checkpoint and Willard integration | **11 passed** |
| Preservation: original mission/aircraft/model/photo bytes and atlas verification | **Passed** |

This is a focused current-pass regression run, not a claim that all 29 registered browser suites were rerun. The final 10 chart and 12 opacity checks used the exact packaged entry hash below. The full source-browser summary and incremental source audits are in the evidence ZIP.

Node/VM checks and explicit GPU/geometry fixtures are distinct from input-driven sorties. Browser testing uses Linux Chromium/SwiftShader WebGL2 with desktop and 844×390 DPR3 touch emulation. No physical Windows, iPhone Safari/WebKit or hardware FPS result is claimed.

The existing full standard Willard acceptance again completed both automated sorties through original flight forces, perception, finite cannon rounds, real flak/cannon/crew damage and earned safe egress. Its declared seeded uniform randomness and automated stick/throttle pilot are preserved; it does not teleport the successful aircraft, change phases, force disengagement or award a win. Separate tests cover optional original ballistic bombing, destruction, ejection/parachute/ground/capture, pause/reload/retry and previous missions.

New native tests exercise chart marks, independent radar drags, false correlations, blindness, run-in plotting, original LOCK and form-key isolation. Visibility tests use real sliders and saved reloads; rear magnification changes actual projection at the same eye/enemy position. Landmark pictures are explicitly declared placement/camera fixtures, not evidence of an additional completed sortie. Physical fused-shell tests produce actual transient GPU illumination. Real context-loss tests verify resource rebuilding and state retention.

Earlier checks ran incrementally, with exact source/module hashes recorded where available. Later scope-shadow corrections are covered by native chart/opacity tests and the final packaged build. Do not describe every earlier check as having used identical final bytes or double-count repeated runs. Expected diagnostic failures and the initial incorrect ARM fixture are separately labeled and excluded from passing totals.

## Limits and historical boundaries

Actual Windows and iPhone Safari testing, hardware frame rate, rotations/backgrounding, subjective sound balance and human difficulty still require device trials. The existing terrain/scenery collision fidelity remains; this visual pass adds no building-collision model. Some legacy countryside photographic cutouts remain rough. The schematic chart is public gameplay information and system navigation, not modern GPS identification; its marks are current-flight notes.

The new route structures, lights and layout are authored representative scenery on generated terrain, not an archival reconstruction of Nam Dinh. The existing [Willard historical audit](WILLARD_EGRESS_HISTORY.md) remains: the user-supplied 1966 account awaits independent corroboration, interceptor type is unconfirmed, supplied MiG art is an approximate 2D game representation, dialogue is dramatized and no confirmed historical kill is claimed. The original McConnell tribute, historical photos and POW source qualifications are preserved.

## Deploy and source identifiers

Branch **`bn-immersion`**; preserved baseline/tag `bn-immersion-start` at `13e35c0f55a8b25168b0d15512b8dfd3fa9c41ca`.

Tested source commit **`29a630af5202ac396b38f42d51606d3fb0a2b1af`**; preceding tested scenery/lighting stage `b8775a7`.

[Download the complete Netlify ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/bn-immersion/releases/Intruder_Yankee_Station_BN_Immersion.zip) — **34,699,026 bytes**, **135 runtime files**. Private GitHub sign-in is required.

ZIP SHA-256: `2946bf4de45cb68639a61e6bb8673d41cfdab24a156adeacbc80d0dbf44a993f`.

Entry SHA-256: `d9e60a93a7cab8b01c3ad5245e1647179114a3bc1f0468630077952b0f83e05d`.

[Runtime manifest](../releases/bn-immersion-build-manifest.json), [delivery summary](../releases/bn-immersion-summary.json) and [twelve selected screenshots](../releases/bn-immersion-screenshots/) accompany the ZIP. The final delivery commit includes this report and artifacts; the source commit above identifies the bytes used by the production build. ZIP CRC, exact allowlist and all runtime hashes were checked before transfer; private Git transfer and downloaded bytes are independently checked after pushing.

The complete static build uses the runtime allowlist. It excludes Git metadata, source reference archives, dependencies, tooling and test evidence. Keep the playable ZIP separate from the evidence ZIP.

On Windows: download while signed into the private GitHub repository, choose **Extract All**, then upload the extracted folder whose immediate children are `index.html`, `assets/` and `_headers` to the existing Netlify project's **Deploys** page. Confirm the page title includes **B/N Immersion**, then try an ordinary B/N strike and Willard. Keep the existing domain to retain local saves; previous Netlify deploys and earlier release ZIPs provide rollback.

The site https://steady-croquembouche-46c1a0.netlify.app/ has not been redeployed by this Git/file delivery. A Git-connected deployment may use branch `bn-immersion`, build command `npm run build` and publish directory `dist/site`. Static gameplay requires no Codex subscription, API key or backend.
