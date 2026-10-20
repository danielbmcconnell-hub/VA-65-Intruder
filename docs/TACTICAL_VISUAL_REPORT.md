# Tactical and visual update

This update adds optional terrain approaches to the existing guided Dixie sortie, makes its depot guns acquire and lose sight of the aircraft, improves scenery/materials and photographic motion, and reports real aircraft damage. It preserves the custom WebGL2 engine, original aircraft physics/geometry/markings, mission definitions, historical photographs, Willard mission and POW progression.

## Changes and reasons

- `assets/flight/tactical-approach.js/.css`: Direct published fixes at a requested 700 m clearance, or lower-side terrain doglegs at 320 m. Commands only the original pilot's heading and clearance; target designation, manual steers and homeward intent take priority. Route state and bounded per-gun acquisition/search state fit the existing validated checkpoint format. Gun bursts require current terrain line of sight, including a new check immediately before the first or later ready burst. Hidden aircraft cannot be shot using their current hidden coordinates. This applies to guided Dixie depot guns; it does not replace all defenses in all missions.
- `assets/flight/strike-scene.js`: Roof panel laps, door/window frames, wall battens, bent ruin panels and rafters, tower ladder/braces, and truck glazing/canvas ribs. Removed the truck's concrete-looking pedestal. Seven mesh batches and 72/108/132 instance budgets remain. Target objects, hit radii, HP, original fires and secondaries still determine damage.
- `assets/flight/visual-materials.js` and renderer hooks: Derivative-filtered crop rows, flowing river highlights and surface-specific weathering. Field boundaries, terrain heights, rivers, chart positions and aircraft materials are unchanged. The terrain detail is active for guided Dixie and on-foot scenes; per-mesh material kinds limit new building detail to the authored Dixie meshes. No new texture downloads or modified photographs.
- `assets/pow/figure-motion.js` and sprite shader: Direction and run/walk hysteresis, time-independent start/stop easing, measured-distance cadence, gentle idle/inspection movement and general ground-character support. The shared grid now has an exact vertex row at the photograph's feet, with matching source UVs. Previously pinning only the tile edge allowed interpolation to move the visible feet. Removed the separate whole-body sway for these actors. Original pixels, opacity, aspect ratios and identities remain intact; no transparent double-image crossfade.
- Nearby foliage uses the same anchored grid for a small breeze. At most 60 plants inside 420 m animate on Medium/High; Low and distant foliage keep the original quad path. The photographed plant base uses its own metadata foot line.
- `assets/flight/airframe-feedback.js/.css`: Transient reports distinguish actual hydraulic, engine, fuel, DIANE, fire and crew changes. Known damaging weapon positions supply general incoming direction. Short filtered/panned sounds reuse the existing gesture-initialized Audio2 context, with at most two owned sources and explicit cleanup. No new context, loop, timer or perfect enemy locator. Original shake, damage allocations and flight consequences remain authoritative.
- `tools/package-build.cjs`: Adds the five runtime modules/styles to the explicit static allowlist and writes a new uniquely named complete Netlify ZIP. Tests, references, source archives, Git metadata and dependencies remain outside the deployment.

## Verification

**751 domain checks in 41 suites, 188 selected final source-browser checks and 15 exact packaged checks passed.** These are completed runs; the full 32-suite source-browser registry was not rerun.

| Final browser report | Passed checks |
| --- | ---: |
| `tactical-native-final/dixie-strike.json` | 26 |
| `tactical-visual-final/tactical-visual.json` | 30 |
| `tactical-regressions-final/progression.json` | 26 |
| `tactical-regressions-final/hud-opacity.json` | 12 |
| `tactical-regressions-final/episode-renderer.json` | 14 |
| `tactical-regressions-final/episode.json` | 49 |
| `tactical-regressions-final/ground.json` | 11 |
| `tactical-regressions-final/willard-renderer.json` | 14 |
| `tactical-regressions-final/willard-lifecycle.json` | 6 |

The actual source-browser reports use Linux Chromium151/SwiftShader WebGL2, with desktop and 844×390 DPR3 touchscreen emulation. All 30 new visual PNGs decode correctly. Same-camera material changes, photographed-foot anchoring, source proportions, nonpatchy opaque interiors,2×distance scaling, wall occlusion, moving/idle NPCs, original guard collision/sound response, and60-near-plant Medium versus Low quad budgets pass. The GPU closeups and camera/roster/isolated-damage fixtures are labeled; they are not additional flown missions. Final runtime entry hash is `28d8d35a88731ffc60f715ab809c45f83c74562e9b1a9992601607a6ba383d08`.

Both final Standard sorties completed uninterrupted in 361.6833 simulated seconds (6m02s), A/98, actual wire 1, eight bombs/four hits/four misses, three of five depots destroyed and both crew alive; four stores remain. They start at original simulation time zero with uniform seeded randomness and genuine native inputs. Native earned retry/reload is separately verified after the completed sortie. The conditional combat-death retry branch was not needed or exercised in these 26 final checks. The earlier genuine fatal B/N diagnostic remains a negative outcome; no hit was suppressed.

The native sortie report preserves each complete trajectory, real damage, weapons expenditure, target result, wire and any earned checkpoint continuation. A real combat loss remains a documented negative path; checkpoint retry restores the actual recorded injuries and spent stores. It is not proof of an uninterrupted sortie when a retry was used. Read the included finish/continuation JSONs for each profile's exact outcome.

An earlier complete mission-launch check passed 22 starts across the original eleven missions, and the renderer lifecycle suite passed 6 checks before the final private-batch fix. These older incremental reports are retained separately and excluded from the final source count above. Final package checks launch original flight, POW/photos/checkpoint, Willard and guided Dixie with native controls, validate both route selection/manual override and all 146 HTTP file hashes/MIME.

Checks caught and corrected a public sprite re-entry recursion exposed by an existing draw observer. The renderer now dispatches its vegetation batches through a private method. Legacy progression assertions were migrated from separate damaged atlases/fixed1.76m assumptions to exact source rows, aspect ratios, feet and original opaque/transparent pixels. The visual PNG test now checks isolated Low-resolution GPU captures against their measured framebuffer size rather than an unrelated full-window dimension threshold. No damage or mission-success rules were weakened to pass tests.

## Delivery

Preserved baseline/tag `tactical-visual-start`: `686da6a3c9f458deb92f6270f1d58f7b133bff86`. Branch **`tactical-visual-polish`**. Implementation `d0e3474`; final runtime/GPU source **`503995daa8054bc86bc6e14ce571a7ba6097ff4d`**. Later test/report/artifact commits retain identical runtime bytes.

**[Download complete Netlify ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/tactical-visual-polish/releases/Intruder_Yankee_Station_Tactical_Visual.zip)** — 34,740,251bytes,146 runtime files. Sign into private GitHub. ZIP SHA256: `e3405a59813e132fe8a528ba4b5d553b65df8a35aaeaa90c0856c573b88fa848`.

[Play/deploy guide](TACTICAL_VISUAL_PLAY_GUIDE.md), [runtime manifest](../releases/tactical-visual-build-manifest.json), [summary](../releases/tactical-visual-summary.json), [selected screenshots](../releases/tactical-visual-screenshots/) and the separate core and regression evidence ZIPs accompany the build. Upload the playable ZIP's extracted index.html/assets/_headers folder, not the evidence archive. The deployment contains all twelve missions. Full history, including 5e32916 and 15b0392, and all 19 earlier release ZIPs are preserved. Independent remote verification is recorded after push.

## Limits and historical boundaries

Physical Windows Chrome, iPhone Safari/WebKit, rotations/backgrounding, hardware 30/60 FPS, subjective audio and human difficulty still need device trials. SwiftShader screenshots establish real WebGL output, not GPU hardware performance. The photographic sheet supplies perspective and guard pose variants, not a complete recorded walking cycle; articulation remains restrained and authored. Source cutout detail and edge quality still limit close-up realism. No new first-person combat system or building collision engine was introduced.

Route assistance surveys the procedural terrain, not an archival flight path. Scenery and crew lines remain representative gameplay reconstructions. All earlier historical qualifications in the POW and Willard reference documents remain. Original family/historical photographs are retained byte-for-byte; no AI replacement was generated. The live Netlify site has not been redeployed by this file delivery.

Full evidence is split into two independent archives so each stays below GitHub’s file limit: [core gameplay and new graphics](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/tactical-visual-polish/releases/Intruder_Yankee_Station_Tactical_Visual_Evidence.zip) and [all selected regression reports/captures](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/tactical-visual-polish/releases/Intruder_Yankee_Station_Tactical_Visual_Regression_Evidence.zip). The playable game is the separate Netlify ZIP.
