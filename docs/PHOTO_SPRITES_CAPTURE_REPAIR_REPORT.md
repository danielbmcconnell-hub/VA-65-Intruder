# Restored photo sprites and capture transition

The movement renderer was routing almost every farmer, VC, militia member and guard through a reconstructed figure sheet. The game now draws the matching supplied photographic atlas in countryside, prison, scenic and combat states. Male VC retain the militia image; female VC retain their separate photograph. Actors retain their identities when alerted or wounded. Movement selects source poses without procedural image warping. Source aspect ratios and foot anchors also apply to cattle; idle grazing no longer alternates with standing poses on a timer.

The stored NVA and aviator atlases had missing rectangular regions, including large areas of legs. Two repaired 48-cell derivatives restore these areas. A separate full-body NVA derivative provides the damaged relaxed frontal pose. These edits reconstruct missing details and are **not pixel-identical originals**. Original atlases remain byte-identical; methods and hashes are in `assets/sprites/provenance.json`. Other character/cattle images retain their original photographic RGB. sRGB decoding before lighting and exposure compensation correct pale uniforms and washed-out faces. Night photos darken with the scene. Source pose coverage and resolution remain limited; this is not newly filmed animation or a full 3D character system.

Capture previously deleted the on-foot actor, set the phase to done, then waited 1.8 wall-clock seconds. The renderer consequently returned to the crashed aircraft. It now keeps the ground actor and camera, freezes gameplay, presents **Captured → Under guard → Later · Confinement**, changes scenes under an opaque fade and reveals the playable prison. Transfer takes about 4.8 simulation seconds with a 0.9-second reveal; Continue becomes available after 1.25 seconds. Pause freezes the transition. Normal capture, river recapture and the legacy compound retain their original confinement destinations. New missions/retries cancel obsolete transfers; recapture counts advance once.

## Validation

- 85 domain checks plus 17 existing POW AI checks.
- 8 actual WebGL sprite checks and 10 capture checks across desktop and simulated iPhone landscape layouts. Native Ready Room prison entry, production sprite routing, measured source proportions/feet, complete repaired figures, decoded alpha, day/night response, native surrender/pause/Continue and river recapture. Sixteen screenshots are included.
- 87 additional browser regressions: progression/rescue/debrief photographs, ammunition and capture/reload, prison touch controls, real guard recapture, ground interactions and Willard mission ownership.
- 17 packaged-build checks serve all 167 files with exact hashes and exercise desktop/touch flight, B/N controls, POW save/history, Willard and Dixie. ZIP CRC and every runtime hash pass.
- Original family/historical photographs, all original mission definitions, A-6A physics/geometry/markings, seven original atlases and 32 previous release ZIPs remain unchanged.

Rendering was tested in Chromium/SwiftShader, with touch/device layout emulation. Physical Windows GPU and actual iPhone Safari were not tested. Declared mixed-roster/ground and isolated lighting fixtures are documented in the JSON; this is not a new claim of every complete mission. The descriptor received a final unit-tested correction to the aviator aiming/fallen source poses after the browser gallery run; those two branches were not exercised by that gallery. The full browser registry was not run.

All 62 newly supplied wildlife/jungle JPEGs are archived byte-for-byte in `reference_media/wildlife/` and `reference_media/jungle/`, with provenance manifests. They remain reference material for the ongoing wildlife/environment work. The unfinished wildlife module is excluded from this deployment.

## Download and deploy

[Complete game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/sprite-capture-repair/releases/Intruder_Yankee_Station_Photo_Sprites_Capture_Repair.zip) (GitHub sign-in required): **48,772,584 bytes**, **167 runtime files**. SHA256 `e9866efe8e860b733aa2325b41b57a401e7fff92154e81457240d02d3514f53a`. Source commit `b0d17a002cf14367f3d7255b846da265dee6cde7`, baseline tag `sprite-capture-repair-start`.

On Windows, Extract All, then upload the extracted folder containing `index.html`, `assets/` and `_headers` to the existing Netlify site's Deploys page. For Git deployment use branch `sprite-capture-repair`, build `npm run build`, publish `dist/site`. The tab title ends **Restored Photo Sprites & Capture Transition**. The live Netlify site has not been redeployed by this Git/file delivery.

[Screenshots](../releases/sprite-capture-screenshots/) · [Test evidence](../releases/sprite-capture-tests.json) · [Runtime hashes](../releases/sprite-capture-build-manifest.json).
