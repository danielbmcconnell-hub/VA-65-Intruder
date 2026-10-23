# Photographic equipment — test and deployment report

The supplied fist, revolver and knife photographs now provide the first-person equipment artwork. White/checkerboard backgrounds are removed with genuine alpha transparency; hands and equipment remain solid. Separate framing keeps the revolver sights centered, knife to the right and fists below the aiming point. Sleeve overscan prevents cut forearms during recoil/strikes. Existing distance-driven gait, accepted-shot recoil, combat, ammunition, movement, saves and flight physics are unchanged.

All three uploaded JPEGs are retained byte-for-byte under `reference_media/firstperson/`, with SHA256 provenance. Transparent runtime derivatives are prepared with the image-editing tool and are not claimed pixel-identical to the originals. No historical/family tribute photograph is edited. Prison interactions share the two-fist composition and retain their separate action animation.

Source commit: `e15439512ecf935ee356ea26d7f313b05f384870`; branch `photographic-equipment`. Baseline tag `photographic-equipment-start` retains the preceding delivered build and complete history. Twenty-eight prior release ZIPs remain unchanged.

## Actual verification

- 47 domain tests: existing equipment timing/animation, ground combat and POW action-state/collision isolation.
- Preservation/assets checks: original photograph hashes, historical mission definitions, complete original A-6A physics/geometry/markings, original and derived atlases, historical POW photographs and JavaScript syntax.
- 21 actual Chromium/SwiftShader WebGL2 browser checks across desktop1280x720 and simulated iPhone landscape844x390/DPR3. All3 PNGs decode; canvas sampling checks transparent background, opaque interiors and clear central aiming point. Original movement/run/crouch, real wall blockage, pause, weapon selection, spent ammunition/repeated recoil, reduced motion and native touch-stick release pass. Genuine cell walking and unfinished native keyboard/touch bunk work use both halves of the shared fist image. Twelve gameplay screenshots, visually inspected across equipment and prison states. No JavaScript or WebGL errors/missing local assets.
- 17 exact packaged-build checks: all157 runtime files served with matching hashes, desktop/touch-layout flight launch and B/N controls, POW chapter/checkpoint/history assets, supplied Willard interceptor and Dixie practice. ZIP CRC and every runtime hash pass.

The equipment browser fixture explicitly initializes the original dry-ground phase and isolates encounters; it does not claim a new full ejection/mission playthrough. The full browser registry and every mission completion were not rerun for this presentation change. All other preexisting runtime files outside `index.html` and the2 equipment-related POW stylesheets match the preceding release byte-for-byte. Physical Windows/iPhone Safari and hardware FPS remain untested. Animation still moves a single photographic pose per equipment state; these are not newly photographed multi-frame hands.

## Changed files

`index.html` (asset mapping, mode tag, framing, title); `assets/firstperson/{fists,pistol,knife}.png`; `assets/pow/core.css` and `episode-actions.css` (shared-hands framing); archived original JPEGs/provenance; `tests/equipment-view-browser.cjs`; `tools/package-build.cjs` (include3 PNGs and new ZIP name). Reports and release artifacts are separate from runtime.

## Download and deploy

[Download complete game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/photographic-equipment/releases/Intruder_Yankee_Station_Photographic_Equipment.zip) while signed into the private repository. Archive: **37,345,388 bytes**, **157 files**, SHA256 `5d5addebeae64ee2ca0b1597191ee138b6cbcc12b701a28954d5816df7e773c2`. Includes all preexisting missions and features; excludes archives, reference originals, Git/dependencies and test evidence.

On Windows choose **Extract All**, then upload the extracted folder containing `index.html`, `assets/` and `_headers` to the existing Netlify project's **Deploys** page. Confirm the tab title ends in **Photographic Equipment**. Git-connected deployment can use branch `photographic-equipment`, build `npm run build`, publish `dist/site`. Keep the same site origin to retain local saves. This delivery has not redeployed the live Netlify site.

On foot: **F** selects the revolver, **V** the knife, **P** fists, **Space** fires/attacks. iPhone uses the labeled **Pistol**, **Knife**, **Fists** and **Fire/Attack** buttons. POW cells retain their existing contextual interactions and equipment restrictions.

[Gameplay screenshots](../releases/photographic-equipment-screenshots/) · [runtime hashes](../releases/photographic-equipment-build-manifest.json).
