# Movement & Combat Polish — implementation and verification

Branch **`movement-combat-polish`** builds on preserved baseline **`c23d086`**. Tested source: **`ca2339b5cd32116fcee335d68fc8a30623ad1b2a`**.

This update makes existing countryside survival controls, equipment movement and hit feedback more consistent. It works within the custom WebGL2 game. The original A-6A flight physics/model/markings, mission definitions, historical and family photographs, POW chapters and rooftop rope remain protected. Historical qualifications and reconstructed-dialogue labels continue to apply.

## Changes

- **`assets/survival/equipment-view.js` and `index.html`:** The existing equipment illustrations now move from resolved walking distance and accepted action timestamps. Running and crouching change the cadence and amplitude smoothly; pushing against a wall stops the walking cycle. Accepted revolver shots and strikes drive brief action motion, including repeated accepted shots while keyboard fire is held. Simulation pause freezes the presentation. System reduced-motion preference suppresses breathing and gait movement. The previous independent CSS animations are removed. No equipment artwork, camera position, weapon damage or ammunition rules are replaced.
- **`assets/survival/ground-combat.js` and `index.html`:** Target eligibility uses the actual view ray and approximate body capsules, including source-based figure heights and a separate cattle shape. Looking clearly above or below a person misses. The nearest exact body intersection takes priority over a small assisted near miss; assistance is bounded to approximately two degrees and 0.16 m padding. The HUD crosshair now shares the projected view centre. Original weapon reach, accuracy randomness, accepted-fire accounting, wounds and witness responses remain authoritative.
- The same module checks the actual shot path against countryside terrain at approximately 0.25 m intervals, capped at 240 samples, so a low rise can block a leg-aimed shot even when the inherited chest-height visibility line is clear. Known camp and POW floors retain their original level/solid semantics.
- Existing short hit kicks now decelerate through the original swept movement solver, including collision with walls, other characters and the player. This supplies bounded displacement feedback rather than teleporting through a solid. It is not a ragdoll or a new injury system.
- **`assets/survival/ground-view.js`:** Countryside survival gains right-side touch look. Its gesture is separate from flight and POW input, retains aim after release, and is cancelled on pause, blur, hidden-page/context interruption, pointer-capture loss or game/actor replacement. Keyboard and pointer-lock look remain available.
- **`assets/render/terrain-shadows.js` and `index.html`:** Moving cattle now provide a stable actor identity so their shadow fade does not restart on every position change. Long sprite-shadow centres project onto the analytic terrain and use a local tangent instead of a horizontal disc displaced above a slope. POW/camp floors and raised-floor descriptors retain their own height. Strong sampled curvature/cliffs omit the approximate shadow. Nearby casts take priority; a cold cache fades in valid sampled descriptors rather than drawing a floating fallback.

The shadow cache contains at most 1,024 entries. Low/Medium/High permit 128/256/384 nearby casts and at most 48/72/96 terrain callbacks per collection. Unchanged static entries require no recurring callbacks. Existing contact cores remain first in the shared draw budget; rescue and aircraft shadow paths remain separate.

The existing touch-release button helper now handles Fire, so a missing browser compatibility click after look gestures no longer loses the action. It preserves release-inside checks, cancelled drags and duplicate-click suppression. Keyboard firing and accepted-fire accounting are unchanged.

Build changes in **`tools/package-build.cjs`** add the three new runtime modules to the explicit static-site allowlist. **`package.json`**, **`tests/run-browser.cjs`** and **`tests/build-browser.cjs`** register the new checks and verify their packaged integration. Domain/browser tests are in `tests/equipment-view*`, `tests/ground-combat*` and `tests/terrain-shadows*`; earlier ammunition, ground-view and awareness checks cover related regressions. `tests/ground-touch-browser.cjs` verifies native right-drag-to-Fire handoff in one persistent touch session.

## Verification

861 domain checks in 48 suites; 278 source-browser checks in 16 selected suites; 17 packaged-build checks.

The eleven broad regression suites ran against source `1a2f81d8635d2e709da5f0945165d463ca23a6b8`. Final review then added only `owner:c` to the cattle sprite descriptor to preserve moving-shadow cache identity. The final source differs by exactly that one runtime line. The affected terrain/cattle GPU suite, general renderer suite and exact packaged-build suite were rerun after the correction; unrelated flight/mission logic was unchanged and its broad results retain their actual source hashes.

The browser methods use actual Linux Chromium/SwiftShader WebGL2, desktop 1280×720 and simulated iPhone landscape 844×390 at DPR3. Native keyboard, pointer-lock or CDP touch inputs drive production ground/weapon methods. Tests use explicitly declared dry-ground, isolated-encounter, actor-placement, floor, wall and camera fixtures; fixed stepping suspends the browser frame scheduler. These are not additional flown missions or a human difficulty assessment.

Equipment tests verify measured travel, smooth run/crouch transitions, wall stops, pause over real elapsed time, accepted ammunition expenditure/repeated recoil, reduced motion, native touch release and separation from POW interaction hands. Combat tests verify vertical aiming, reticle projection, real accepted sky misses/body hits, original wall collision, nearer/elevated bodies and a foreground terrain obstruction. Isolated hit-eligibility cases control randomness; they do not establish normal combat accuracy or balance.

One original Willard lifecycle test exceeded its unchanged 1.8-second load assertion under concurrent software-GPU load (2.295 seconds). The same test passed when rerun alone, including real delayed-capture ownership checks; the assertion was retained. This does not establish physical-device loading performance.

Earlier regression runs detected runtime files changing during execution; those runs were retained as diagnostics and rerun against the final frozen source. An unsuccessful search for a naturally occurring chest-clear/leg-obscured ridge was replaced with an explicitly declared ridge fixture. It is not presented as an encountered native mission scene.

The shadow GPU fixture exposes the original displaced flat disc and the corrected local plane on a declared 0.55 slope. Darkened pixels increase from 246 to 550, with 655 pixels changed. On three selected native 8 m clipmap probes, one improves from 984 to 1,167 darkened pixels; **the other two show no visible long shadow in either state**. All probes remain in the report. Raised-floor GPU checks preserve a floor at 13.4 m. Callback instrumentation verifies bounded work, not device FPS.

## Remaining limits and deployment

Body capsules approximate photographic silhouettes; they are not per-pixel hits or full mesh ballistics. Existing solid-visibility checks remain conservative 2D sampling, so this does not add shooting through architectural openings or a complete three-dimensional building collision model. Source photography and stylized equipment art retain their original detail and directional limits; the movement is authored presentation, not a filmed animation cycle.

Analytic shadow projection does **not** establish universal grounding or wrapping over the native interpolated terrain. The original 8 m clipmap and CPU height field need not coincide at every fragment. This pass does not change terrain geometry, terrain physics or actor coordinates to hide that limitation.

Physical Windows GPU and iPhone Safari/WebKit testing, sustained frame rate, rotation/backgrounding, sound, comfort and human difficulty remain device checks. The live Netlify site has **not** been redeployed by this work.

The complete release is [Intruder_Yankee_Station_Movement_Combat_Polish.zip](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/movement-combat-polish/releases/Intruder_Yankee_Station_Movement_Combat_Polish.zip); sign into private GitHub. Final archive identity and transfer results belong in the release summary. Follow the [download, play and Netlify guide](MOVEMENT_COMBAT_PLAY_GUIDE.md): Windows **Extract All**, then upload the runtime folder containing `index.html`, `assets/` and `_headers` through the existing Netlify project's **Deploys** page. Keeping the same origin retains local saves on that browser/device.

## Archive verification

Complete Netlify ZIP: **Intruder_Yankee_Station_Movement_Combat_Polish.zip**, 34,760,892 bytes and 153 exact runtime files. SHA256: `234a8163a68663b67d63f6741c5b74228ac67c265639cfe68618c61aac011518`. The evidence ZIP includes 54 decoded screenshots and the selected final JSON/log reports.

| Source-browser suite | Passed checks |
| --- | ---: |
| equipment-view | 15 |
| ground-combat | 14 |
| terrain-shadows | 8 |
| ground-touch | 8 |
| renderer-final-owner-fix | 6 |
| renderer | 6 |
| progression | 26 |
| ground | 11 |
| m24-ammunition | 22 |
| ground-view | 19 |
| refinement-visual | 18 |
| episode | 49 |
| tactical-visual | 30 |
| willard-renderer | 14 |
| willard-lifecycle | 6 |
| dixie-strike | 26 |
