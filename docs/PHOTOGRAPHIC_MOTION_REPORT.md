# Higher-resolution photographic motion

The farmer, male militia/VC, female VC, NVA/guards, aviator and cow each have separate **sixteen-frame walking and sixteen-frame running cycles**: **192 movement photographs across 48 four-pose plates**. The six standing photographs, aiming photographs and fallen photographs remain available. The added poses are generated photographic derivatives guided by the existing complete character photographs; they are not filmed camera sequences. Original reference atlases and private family/historical photos remain unchanged.

The source plates are 1024 × 1536 pixels for humans and 1536 × 1024 for cows, with nominal per-pose cells of 512 × 768 and 768 × 512 respectively. Each complete figure is extracted from its measured bounds, so the retained canvas can vary. Movement textures are generally 512 × 768 on desktop and 384 × 576 on touch layouts, with landscape equivalents and common-canvas adjustments where needed. The original standing textures retain their existing higher resolution.

Movement playback measures actual horizontal displacement. Walking and running select different pose cycles, and frame cadence follows travel distance. Pause, blocked movement and teleports do not advance a gait. Shared frame scale and upper-body registration keep the torso steady. A common floor baseline holds stance feet on the ground while running flight poses can lift their feet naturally. The renderer selects one complete pose at a time; it does not mix translucent duplicate figures. Optional motion frames share a bounded GPU cache with the existing photographs. Exact source and retained GPU dimensions, cache usage, rendered fixtures and timing checks are recorded in the test evidence.

The five human running cycles use pose-specific timing derived from photographed foot clearance: contact poses last slightly longer and airborne poses pass faster, within 12% of equal pose durations. The total stride distance stays unchanged, so animation still follows actual travel rather than rendering frequency. Walking and cow cycles retain uniform distance timing.

The runtime motion plates use exact lossless WebP container encoding. Every decoded RGBA byte, including the RGB of transparent pixels, matches the generated PNG. The PNG sources remain preserved in Git. No resolution, pose, color or alpha changes were applied during encoding.

Four female running frames have a uniform runtime camera-size correction; their PNG and WebP source pixels remain unchanged. An automatic 6.318% aviator silhouette-height flag remains visible in the source audit. Manual review found consistent head/vest/hip framing and attributed the shorter bounds to bent-leg and flight poses; the [review receipt](../releases/photographic-motion-aviator-pose-review.json) records the current source hashes and the accepted interpretation.

The previous capture/transfer transition remains in this complete game. Flight missions, A-6A simulation/geometry, historical photos, first-person equipment and original collision/combat behavior are preserved. Unfinished wildlife code remains excluded.

## Validation

- **101 domain checks**, with zero failures.
- **31 motion browser checks**, including actual WebGL2 output. The evidence describes the exact isolated movement fixtures, render dimensions, source hashes and scope.
- **10 complete-photograph browser checks** cover the standing, aiming and fallen photographs after the animation/cache changes.
- **3 isolated WebGL2 adapter checks** cover optional image failure/backoff/recovery, distant actors and releasing stale cache pins; these are not full-game navigation or FPS tests.
- **10 capture** and **14 combat** browser regression checks.
- **19 packaged deployment checks**: all 218 runtime files served with exact SHA256 hashes, native desktop/touch-layout flight and B/N controls, POW saves/history, Willard/Dixie, and actual decoding/upload of the packaged sixteen-frame walking assets within the GPU budget.
- ZIP CRC and every runtime hash pass; all **34 previous release ZIPs** remain unchanged.

Browser checks use Chromium/SwiftShader WebGL2 with desktop and iPhone landscape layouts. Physical Windows GPU performance and actual iPhone Safari were not tested. The full browser registry was not run. See the evidence for any remaining visual or test limitations; these checks do not claim full mission completion.

## Movement preview

[Walking and running in the production ground renderer](../releases/photographic-motion-screenshots/desktop-ground-walk-and-run.mp4) shows complete poses moving across the game terrain. This 640 × 360 verification fixture advances two characters with fixed kinematic movement for two simulation seconds at 30 captures per second. It uses the production ground camera and renderer; it is not a physical-device FPS measurement. Native prison AI movement and pause behavior are checked separately, but the closed-cell camera occludes the guards, so its footage is not presented as visible patrol evidence.

## Download and deploy

[Complete game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/highres-fluid-movement-site.zip) (private GitHub sign-in required) contains **218 runtime files**. The download is GitHub’s archive of the runtime-only branch `highres-fluid-movement-site`. Its file contents match the tested build; GitHub generates the archive compression and wrapper folder separately. Runtime source commit `796a8b1941d6c6f0a66450d8fbdc66ac93dcbf54`.

The local build ZIP is **128,429,372 bytes**, SHA256 `d91c98e124fc16680bf9884b33353b4d5c91339bcdcd804a4924fe13eebd18d7`. This is the local packaging checksum, not the checksum of GitHub’s separately generated archive ZIP.

Extract All, open the archive’s outer folder, then upload the game folder containing `index.html`, `assets/` and `_headers` to the existing Netlify site's Deploys page. Git build: branch `highres-fluid-movement`, command `npm run build`, publish `dist/site`. This delivery does not itself redeploy the live Netlify site.

[Rendered screenshots](../releases/photographic-motion-screenshots/) · [Test evidence](../releases/photographic-motion-tests.json) · [Runtime hashes](../releases/photographic-motion-build-manifest.json).
