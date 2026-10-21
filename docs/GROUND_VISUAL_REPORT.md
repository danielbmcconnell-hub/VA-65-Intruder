# Ground & Visual Refinement — implementation and verification

Source commit **`a487480`**, branch **`ground-visual-refinement`**, preserved baseline **`35d0b6b`**. Runtime entry SHA-256: `db6069f35d2904921d06f78db25d0d84d47c38b1129499f83ff5f5c538d8d80f`.

This update improves photographic filtering, contact with the ground and first-person controls within the existing custom WebGL2 engine. Aircraft physics, models, mission content, historical materials, previous milestones, rooftop escape rope and existing Git history are preserved. Family and historical photographs remain unchanged; no replacement images were generated.

## What changed

- **`assets/render/sprite-layers.js` and `index.html`:** Original people and vegetation frames now have independent texture-array layers and mipmaps. Native tiles remain 192×384 for 72 people frames and 192×256 for 48 vegetation frames. Minification cannot average a neighbouring character or plant into the selected frame. Premultiplied alpha, opaque-interior depth writes and blended soft edges remain intact. Existing source proportions, photographed foot anchors and bounded articulation are retained. Array, ordinary texture and shadow samplers use separate units 5, 0 and 7; complete fallbacks remain available. Uploads and one-pixel proxies restore pixel-unpack/binding state, replaced resources are deleted, and context restoration rebuilds the arrays.
- **Memory:** The two native arrays, including mipmaps, use **40,893,696 bytes, approximately 39 MiB of computed texel storage, excluding driver overhead**. This is approximately 10 MiB above the two native packed base images. Each array replaces its packed 2D GPU atlas; only a 1×1 2D compatibility proxy remains. The implementation does not retain both large representations. Unsupported uploads fall back to the existing ordinary atlas renderer. Temporary frame canvases are released after upload.
- **`assets/render/contact-shadows.js` and `index.html`:** Bounded nearby NPC contact cores join the original shadow pass, ahead of long shadows so vegetation cannot consume their draw budget. Caps are 12/18/24 for Low/Medium/High. Cores follow the local terrain tangent and preserve elevated prison floors. Actual GPU tests exposed an existing downward winding on the horizontal shadow strip: back-face culling hid it from above. Reordering the vertices now gives an upward surface normal. Neither player nor NPC bodies are moved to create the effect.
- **`assets/survival/ground-view.js`, `assets/pow/core.js` and `index.html`:** Desktop ground mouse look uses pointer lock without feeding flight controls; entering from keyboard look retains the visible pitch. Physical crouch changes immediately while eye height eases with elapsed time. Pause, blur and gesture cancellation clear held input. Existing POW strafing, walls, interaction rules and river/swimming camera ownership remain authoritative.
- **`assets/render/quality-policy.js` and `index.html`:** Sustained slow foreground gameplay can lower graphics once for the current session, with an explanatory notice. Warmup, a 90-frame window and hitch/background exclusions prevent one slow frame from triggering a drop. Saved graphics preferences remain unchanged; explicit user selection resets adaptation. This is a responsiveness safeguard, not a measured device-FPS guarantee.
- **Tests/build/docs:** Four new domain suites and four browser suites cover these changes. `tools/package-build.cjs` includes the four runtime modules in the explicit deployment allowlist. See the [play and deployment guide](GROUND_VISUAL_PLAY_GUIDE.md).

## Verification status

The selected source-browser, domain and exact packaged-build checks below completed successfully. The complete 36-suite browser registry was not rerun.

| Verification | Status | Checks |
| --- | --- | ---: |
| Node/VM domain checks across 45 suites | Passed | 816 |
| Real WebGL sprite upload/state/lifecycle | Passed | 132 |
| New visual browser suite | Passed | 18 |
| New ground-view browser suite | Passed | 19 |
| New session-quality browser suite | Passed | 8 |
| Eleven selected existing browser regression suites | Passed | 216 |
| Exact packaged-build browser verification | Passed | 17 |

The new browser suites run actual Linux Chromium/SwiftShader WebGL2 at 1280×720 and an 844×390 DPR3 touch layout. Their **177 passed checks** are separate from the domain total. They do not constitute a rerun of every registered browser suite.

The visual suite supplies **22 decoded PNGs**. Native Ready Room entry creates the original prison cell; eight seconds of fixed-step original AI updates verify moving guards against real wall collision. A declared yard roster uses original sound responses to move a farmer, VC and NVA. Separate GPU fixtures explicitly control camera, lighting, floor and test sprites; they are not additional completed missions or normal daylight prison spawns.

An independently uploaded untouched 2D atlas matches the layered LOD0 images with **zero pixels differing by more than three RGB levels; maximum channel difference is one**. Near/middle/far figures retain solid bodies, perspective scaling and full wall occlusion. Every sampled hostile-neighbour synthetic mip contains exactly `[0,128,0,255]`. In that synthetic moving-camera checker test, mean green temporal difference drops from **19.113 to 0**; this is not a universal sharpness claim. Flat/sloped/raised-floor boot regions darken **161/232/161 pixels**, with no changed body pixels above the feet or leakage through an opaque wall. Repeated uploads delete both replaced handles; real `WEBGL_lose_context` loss/restoration retains the prison game and rebuilds two bounded arrays.

Ground tests distinguish native keyboard/pointer-lock and CDP touch input from declared camera/clock fixtures. They cover original prison collision and actual ejection/parachute transition into countryside survival. Quality tests use controlled completed-frame timestamps to exercise adaptation deterministically; these timestamps are not performance measurements.

One existing episode regression initially sent a touch-look gesture while its own hidden fixture screen was active. The new input guard correctly rejected it. The harness now suspends RAF while briefly exposing the actual game screen for the trusted gesture; the original angle, displacement, collision and normal-patrol assertions are unchanged. The full 49-check episode then passed, including the physical roof/rope/river route on both layouts. The earlier failure is retained separately as a diagnostic.

## Build, deployment and limits

**Complete Netlify ZIP:** [Intruder_Yankee_Station_Ground_Visual_Refinement.zip](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/ground-visual-refinement/releases/Intruder_Yankee_Station_Ground_Visual_Refinement.zip). Private GitHub sign-in is required. The exact archive identity and runtime file manifest are recorded below and in the release summary. The private download requires repository access.

On Windows, extract the runtime ZIP and upload the folder containing `index.html`, `assets/` and `_headers` to the existing Netlify project's **Deploys** page. Git-connected deployment uses branch `ground-visual-refinement`, command `npm run build`, publish directory `dist/site`. The build contains the complete existing game, excluding reference archives, development tooling, tests and Git metadata. Keep the same website origin to retain browser saves. This work has **not changed the live Netlify site**.

The supplied people sheet is palette-limited and contains directional/pose photographs, not a filmed walking cycle. Better filtering cannot create missing close-up detail; movement remains restrained authored deformation. Physical Windows GPU and iPhone Safari testing, sustained 30/60 FPS, rotation/backgrounding, sound and subjective comfort remain manual checks. Historical qualifications and reconstructed dialogue in the existing source documents remain in force.

## Packaged delivery verification

Complete playable archive: **Intruder_Yankee_Station_Ground_Visual_Refinement.zip**, 34,751,343 bytes, 150 exact runtime files. SHA256: `2ddf2db8f6df934f256a3e3b61b45410f82a8788a1d8c78b3d3e60936d4f8c38`. 393 browser checks and 17 packaged checks passed; 816 domain checks passed in 45 suites. The evidence download includes 49 decoded screenshots and all selected final JSON/log reports; additional regression captures remain in the workspace.

| Existing regression suite | Passed checks |
| --- | ---: |
| renderer | 6 |
| missions | 22 |
| progression | 26 |
| hud-opacity | 12 |
| episode-renderer | 14 |
| episode | 49 |
| ground | 11 |
| willard-renderer | 14 |
| willard-lifecycle | 6 |
| dixie-strike | 26 |
| tactical-visual | 30 |

The live Netlify site has not been redeployed. See the [play and deployment guide](GROUND_VISUAL_PLAY_GUIDE.md) for the Windows download and upload steps.
