# Milestone 1 — stability and graphics

The custom WebGL2 engine, A-6A geometry, aircraft physics and all eleven mission definitions remain in place. `chatgpt-v11-baseline` preserves the imported V11. Repairs are in subsequent local commits; nothing has been pushed or deployed.

## Final result — 8 October 2026

**67 browser regression checks and 3 deployment checks passed.** Gameplay screenshots were captured and visually inspected, including photographic farmers, VC/NVA soldiers, vegetation, prison cell/yard, and the clean rescue debrief portrait.

| Check group | Passed | Scope |
| --- | ---: | --- |
| Renderer | 6 | Actual WebGL pixels, opacity, occlusion, GPU resource lifetimes and repeated context recovery |
| Missions | 22 | All 11 missions: desktop and native Chromium touch input, briefing/start/launch and four seconds of flight |
| Progression | 28 | Desktop/touch rescue, Mission 11 escape/solitary retry, regular capture/Homecoming, audio signal, photos and Cruise Log |
| Ground/collision | 11 | Reproduced AI/combat/control/capture defects and wall/wreck/body collision sweeps |
| Packaged deployment | 3 | All 34 runtime file hashes over HTTP; real desktop High and touch Medium launches; 18 image decodes per layout |

The integrated regression reports were recorded at 17:34–17:41 UTC; deployment verification at 18:21 UTC. Both used the same final `index.html` SHA-256: `de763008699a5b7a2c1de46ce754d205951d33c4a94f9dfa256a22e5f177086d`. There were no uncaught JavaScript errors or missing game assets in the checked routes. Exact preservation and strict original/derived image checks also passed.

The runtime ZIP contains 35 files including Netlify `_headers`, with `index.html` at the root. Reference folders, archive, test tooling and Git history are excluded. The evidence ZIP contains the reports and actual browser PNGs; `dist/build-manifest.json` identifies the release commit and runtime hashes. Milestone 2 has not begun.

## Corrected defects

- Corrupted standing debrief and ready-room/history portraits: exact supplied originals, native dimensions/aspect ratio, no filters or fades. Restored all twelve damaged cruise photographs, insignia PNG and photographic fallback sheet from the clean archived build. No AI-generated or retouched portraits.
- Sprite atlas sampling: actual half-texel boundaries, premultiplied upload, opaque interiors with depth writes, separately blended edges, correct shadow sampler binding. Prevents frame bleed, ghost-like bodies and guards showing through walls.
- Conservative derived atlas mattes recover surviving original photograph pixels and remove disconnected vegetation labels/fragments. Original atlas RGB, dimensions and files are preserved. Clean full-body photographic NVA figures already present in the original game replace unusable external NVA poses; eight camera-relative directions remain available.
- Characters use visible-photo bounds for ground anchoring and natural proportions. Vegetation uses visible bottom anchors at terrain elevation and avoids sliced tree cells. Compatible walking/aiming poses replace transitions to cropped/dead/pointing frames. Ground camera near plane no longer clips actors at arm's length.
- Undefined `MATIMG` fallback crash; undefined `W` in Cruise Log; incorrect Iron Hand bomb parsing (six Mk82 bombs, separately two ARMs), and unintended ordnance on the unarmed training mission.
- NaN close-range NPC facing; ignored surrender/contact with armed locals; knife availability incorrectly tied to remaining pistol ammunition; shots/melee through prison walls; contact pushes bypassing static collision; camp timer advancing twice; movement during the frozen cell scene.
- Mission 11 eject/breakout/escape objectives and results; repeat-capture transitions after escape; capture history separated from the active capture transition; surrender now enters the appropriate captivity chapter; rescue/escape logged as crew recovery without treating the aircraft as returned. First-contact follow-up cards reopen correctly after choosing to run.
- Mobile weapon/attack/smoke actions persist until simulation consumes them. Mission-start and delayed narrative callbacks cannot replace a newer mission. Repeated WebGL context loss rebuilds graphics and preserves the paused mission for explicit resume.
- GPU target disposal on resize/quality changes; medium touch shadow allocation reduced from 64 MiB to 16 MiB, low quality uses a disabled one-pixel shadow map. Held keyboard inputs clear without disconnecting their listeners during context recovery; pending debriefs remain available.

## Verification

Run from the project directory:

```sh
npm ci
python3 -m pip install -r requirements-dev.txt
npm run test:assets
npm test
npm run build
npm run test:build
```

Use Node 20+ and Python 3.11+ (tested with Node 24.19.0 and Python 3.12.14). Install the Python packages in a virtual environment if required by your system. The browser runner starts and closes a restricted local HTTP server automatically. It uses actual Chromium 151/WebGL2 through SwiftShader; it does not replace the physics, AI or renderer with mocks. Reports and PNG screenshots are in `test-results/`. Regeneration of derived assets is separate: `python3 tools/process-atlases.py` uses the pinned Python packages above.

- Exact source/hash comparisons protect all original family photographs, original atlases, complete aircraft physics, A-6A model/markings and mission definitions. Strict image decoding and derived-atlas checks protect photographic RGB and anchor metadata.
- Mission matrix: all eleven mission briefings/starts on desktop and an iPhone-sized Chromium touch layout, actual keyboard/native emulated-touch catapult input, four seconds of real fixed-step flight, finite/live aircraft and zero WebGL errors. This verifies 22 starts/launches, not human completion of every bombing mission.
- Renderer: real GPU creation/deletion balances on resize/quality changes; actual pixel readback for solid opacity, fractional edge blending, atlas neighbour isolation and wall occlusion; real forced context loss/restoration, including repeated loss before resume.
- Ground regression: finite close-range facing/visibility, knife after last round, armed-local surrender, camp clock, frozen cell controls, wall/wreck/body sweeps, wall-blocked shots, static-safe contact push and recapture at dawn.
- Progression: actual UI/narrative controls and real fixed-step simulation cover title/Ready Room, ejection/descent, survival movement, photographic farmer/VC/NVA/vegetation scene, queued weapon controls, radio, smoke, helicopter approach/hover/hoist, recovered debrief photo, Cruise Log, regular capture/Homecoming debrief, and Mission 11 cell/solitary/retry/yard/city/river/escape/debrief/log.

Progression fixtures explicitly reposition the aircraft over dry ground, accelerate rescue/capture clocks, isolate encounters, and place the player at existing climb/river objectives. These verify transitions and rendering, not gameplay difficulty or a human playthrough. Shader fixtures use synthetic colour sheets and real mesh depth to measure GPU behavior; gameplay screenshots use the game's photographic assets and terrain.

## Remaining limits for your PC/iPhone test

No physical iPhone Safari or Windows hardware session was available. Chromium touch emulation is not Safari, and software GPU timing is not a device performance benchmark. WebKit installation was blocked by the cloud network policy; no Safari success is claimed. Verify landscape/portrait rotation, safe areas, touch reachability, sustained frame rate, audio/voice quality, tab suspension/resume, device memory pressure and a full flight/landing on the target devices. Audio graph activation/signal can be measured automatically; audible mix quality requires listening.

The external atlases contain incomplete source artwork and limited true gait poses. Conservative masks and existing clean photographic figures improve solidity; they do not manufacture missing limbs or a new eight-frame leg animation. Further art/animation work belongs to a separately authorized milestone. Full historical fact/citation review is also separate from preserving existing flight/mission content.

Soft transparent edges sort within each atlas batch; overlapping edges from different sheets can still have a minor ordering artifact. Opaque character interiors and wall occlusion are covered by the GPU regressions.

The large separate reference-media ZIP could not be opened through the attachment tool's 32 MiB limit. The project ZIP supplied the original photographs used in these repairs; the missing videos were not claimed as reviewed.

## Photographs by location

| Screen/location | Restored file/source |
| --- | --- |
| Opening title | `assets/photos/carrier-portrait.jpeg`, exact clean carrier original 978×1369 |
| Ready Room crew card and Squadron History dedication | `assets/photos/crew-portrait.jpeg`, the same exact carrier original, native proportions |
| Ground first-contact/survival cards | `assets/photos/survival-portrait.jpg`, exact supplied survival portrait 1060×1484 |
| SAR-recovered mission debrief | `assets/photos/standing-portrait.jpeg`, exact supplied standing original 864×1223 |
| Cruise Book, briefing/loading/header/lightbox photographs | Twelve exact clean archived Navy/cruise images; manifest identifies each |
| Prison/captivity/escape cards | No additional McConnell photograph mapping exists in the original prison cards; the associated survival and debrief slots above are repaired |

The dedication now displays the user's supplied 1968–1969 VA-65 service dates. The carrier portrait, survival portrait and standing portrait originals remain untouched in the reference folders.
