# Complete higher-resolution photographic characters

Characters and cattle now use **15 individual complete photographic PNGs**, each **1024×1536** (portrait) or **1536×1024** (landscape). The previous sheets allocated only 192×288 pixels per human pose, and about 148×222 pixels in the repaired sheets. The game no longer selects those small cells when somebody moves, aims, is hurt or falls.

There are six complete standing/base subjects (farmer, male militia/VC, female VC, NVA/guard, aviator, cattle), three complete aiming poses and six horizontal fallen poses. A subject keeps its own image identity. Each pose has its own texture, measured visible bounds, original aspect ratio and ground anchor. Body interiors remain opaque; naturally soft edges use smooth filtering. Whole-image mipmaps prevent distant shimmer without mixing neighbouring figures. Motion retains a complete photograph, avoiding image warping and damaged frame cycling. Missing crouch/directional movement poses retain the same complete base photograph; this is a limited set of discrete photographic poses, not filmed gait or a full 3D character model.

The files are **restored derivatives based on the supplied references**. Lost detail and alternate poses were reconstructed with the image-editing tool; they are not newly recovered original camera photographs or pixel-identical originals. Original source atlases and family/historical photos are unchanged. Per-image hashes and methods are in `assets/sprites/hires/provenance.json`.

The renderer retains up to 832×1248 pixels per portrait on desktop and 640×960 on touch, with landscape equivalents. All 15 textures and full mip chains fit bounded 80MiB desktop/48MiB touch budgets. The old character/reconstructed-figure textures are no longer uploaded. Unused original/processed/repaired character sheets are excluded from the deployment but remain in Git. Existing photographic foliage retains its previous assets/resolution; this release improves people and cattle.

Ground simulation waits for the six base photos, with a visible loading message, so invisible searchers cannot advance during decoding. Image failures use the existing graphics error screen. A new mission or completed loading clears the loading veil, including while paused. The existing capture/transfer fade remains. Flight, missions, player controls, combat rules, collision solver, first-person equipment and rescue behavior are preserved.

## Validation

- **82 domain checks** covering whole-image bounds/aspect, asset resolution, player/weapon movement, contact shadows, combat geometry and capture transition.
- **10 actual WebGL photograph checks**, desktop High graphics and touch-layout Medium graphics. Native prison entry, complete decoded/source and GPU body alpha, smooth mipmaps, bounded memory, correct full-image pose routing, declared grounded daylight roster and 3m/8m/18m viewing fixtures. Every one of 15 poses was rendered at 3m on both layouts; ten representative screenshots are included. See JSON for exact source hashes and any narrowly scoped reruns.
- **10 capture** and **14 combat** browser regression checks: native surrender/pause/transfer/recapture, keyboard/touch aim, ammunition/hits, collision reactions, elevated bodies and terrain/solid occlusion. The combat fixture now verifies its dry corridor at production-like spacing; assertions remain intact.
- **2 loading/error probes** verify that a delayed base photograph holds player/AI simulation, its completion clears the veil while paused, and a missing image produces a useful error with a working exit.
- **17 packaged-build checks**: exact hashes for all 169 files served from the deployment folder, flight/B/N controls, POW saves/history, Willard and Dixie. ZIP CRC and all source/runtime hashes pass. All33 previous ZIPs remain unchanged.

Tests use actual Chromium/SwiftShader WebGL2 and iPhone landscape layout emulation. Physical Windows GPU, actual iPhone Safari and hardware performance were not tested. The full browser registry was not run. Isolated roster/view fixtures are documented as such; they are not claims of full mission completion. Original wildlife/jungle references remain preserved for their separate ongoing work; unfinished wildlife code is excluded.

## Download

[Complete game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/highres-complete-photos/releases/Intruder_Yankee_Station_High_Resolution_Photos.zip) (GitHub sign-in required): **58,161,847 bytes**, **169 runtime files**. SHA256 `affdbfbf9b246160f9ae3d2561c3f929a4abf3ff16d66ceae690a57e0dbe95a8`. Source `b395226b30d1ff326e17f2b782d5a2ac0fe4f3f8`, baseline tag `highres-complete-photos-start`.

Extract All on Windows, then upload the extracted folder containing `index.html`, `assets/` and `_headers` to the existing Netlify site's Deploys page. Git deployment: branch `highres-complete-photos`, build `npm run build`, publish `dist/site`. Tab title ends **Complete High-Resolution Photographs**. The live Netlify site has not been redeployed by this Git/file delivery.

[Screenshots](../releases/highres-photo-screenshots/) · [Test evidence](../releases/highres-photo-tests.json) · [Runtime hashes](../releases/highres-photo-build-manifest.json).
