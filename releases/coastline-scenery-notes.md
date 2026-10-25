# Coastal scenery, clearer controls and B/N guidance

[Download the private complete game](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/coastline-scenery-site.zip) (GitHub sign-in required). [Current test evidence](coastline-scenery-tests.json) · [Runtime manifest](coastline-scenery-build-manifest.json) · [Reviewed current images](coastline-scenery-screenshots/).

This update repairs the measured coast/water transition after ejection, makes information panels easier to manage, restores clear selected-weapon controls, and explains the bombardier/navigator’s next action. The existing second aviator, companion controls, photographic characters and prison scenes remain available; no new aviator artwork is claimed here.

## Playing the update

When carrying the equipment, **V selects the knife**, **F draws or holsters the pistol**, and **T, left-click or the visible STAB/FIRE button uses the selected weapon**. **Space punches with a free hand**; with both hands empty the punches alternate right and left. Holding T does not repeatedly spend pistol rounds; held mouse/touch primary input retains its original behavior. A nearby supply interaction can take priority on F. When a parachute is caught in a tree, hold V for the existing cutaway action.

In the **B/N seat the pilot flies** while you navigate, identify and designate targets, and hold release consent through the cleared bombing solution. Read CHART, use LOCK for navigation fixes or target selection, and use STEER to send the pilot toward the radar crosshairs. The briefing, role lesson and live guide explain the current phase. A navigation fix is separate from a target designation. The gear guidance now correctly distinguishes immediate retraction from the game’s 260 KIAS extension limit.

The compact information dock keeps original guidance and worksheet controls reachable. Expanded reading panels still occupy part of the cockpit view and scroll. Crew captions sit above the held weapon and Supplies/Punch row. Camp contains original Save, Continue and settings; solitary goals show actual Body, Mind, Hope and Fatigue, daily work and the next requirement. Opening Goals grants no progress. The quiet-reflection Hope benefit is limited to once per day.

Each demonstration previews its own objective, route and features, then shows actual objective progress and Control/Watch cues. Pause, Take controls and Stop protect the player’s campaign storage. Call crewmate remains available when the two aviators land apart.

## Recorded verification

All evidence below binds tested source `28154555dcee1acf5cb761fca1185bf2e6056155`. Runtime files, tests and actual HTTP bytes are preserved in the linked evidence; earlier failed and partial reports remain unchanged diagnostics.

| Current scope | Recorded result |
| --- | --- |
| Complete CPU runner | 1,055 passing cases across 87 programs; zero failures, skips or cancellation |
| Nine named native browser suites | 177 passing checks |
| Selected terrain/control subset | 5 suites / 112 checks, included in the 177 above |
| All twelve original-update demonstrations | 12 successful outcomes and objectives; 44 mission/storage checks |
| Packaged runtime | 25 native checks and all 313 actual HTTP file hashes |
| Selected current renderer images | 8 directly reviewed original PNGs |

The nine named browser suites are coastal-scenery 10, HUD layout 14, confinement goals 27, mission tutorial 14, near-ground 8, terrain-shadows 8, ground-view 19, onboarding 46 and ground-combat 31. This is explicitly scoped current coverage, **not the full 52-suite browser registry**. Legacy assertion programs contribute file-level CPU runner cases; the count does not invent a case for every inner assertion. The preceding Night release’s full 48-suite result remains prior-release evidence, not a current test of this code.

The shoreline tests use the production ocean/terrain programs with declared GPU inspection cameras. Both layouts have **zero interior LOD double coverage**, while 16 desktop and 3 phone shared-edge raster ties remain separately counted. Across six translated shore masks, observed unambiguous errors were 0–1 pixels on desktop and 0–2 on phone within the declared ambiguity exclusion; the four-pixel acceptance bound is not presented as an observed result. Frozen repeated frames were identical. These fixtures do not establish universal scenery quality or hardware frame rate.

Native weapon checks cover actual T/pointer/touch input, ammunition accounting, free-hand Space behavior and browser pointer lock. Their target, wall and temporary terrain/baseplate cases are declared fixtures, not natural encounter-frequency measurements. Current goals checks include desktop and landscape/portrait phone layouts with original activities, time and Save/Continue handlers.

All twelve demonstrations earned their normal game success criteria without health, position or outcome grants. In this recorded run, m1–m5 and m7–m10 recovered by carrier landing, m6 recovered by the original post-ejection SAR sequence, m11 earned its explicitly fictional alternate-history escape/rescue, and Willard earned its safe-egress result. The harness uses original simulation/physics/weapons/objectives with CPU fast-forward after native WebGL initialization; it is not a full-speed film or hardware FPS test.

The fresh successful m11 run finished at 1252.8 seconds on the demonstration controller’s elapsed clock, within the explicitly declared 3600-second harness budget. Other mission budgets stayed unchanged. The earlier 2200-second run with incomplete river progress was preserved; this successful run did not resume that case. Original success and campaign-storage assertions were retained.

## Complete private delivery and preservation

The runtime-only `coastline-scenery-site` commit is `a6860140176214a205d3e73ffe083e9ec2dfb1ee`, with tested source `28154555dcee1acf5cb761fca1185bf2e6056155` as its sole parent. The annotated `coastline-scenery-playable` tag marks the source documentation/evidence release. All tested code, assets, tests and tooling remain identical to the tested source in that documentation commit.

The accepted local ZIP contains **313 runtime files**, is **223,678,418 bytes**, and has SHA256 `1138a84832dbe486d4a84fb283cd16cb07850b8c083e96092ad407c9e3d18eb5`. ZIP CRC and every source/site/ZIP file hash passed. GitHub generates its own outer folder/compression; this checksum describes the accepted local ZIP, not GitHub’s separately generated archive.

All 780 protected media/archive blobs, 72 earlier published ref records and the prior Night local ZIP remain unchanged. The [Night release and its private download](../docs/NIGHT_REALISM_REPORT.md) remain available. The independent transfer helper subsequently reuses the clean separate verification checkout/object cache and materializes/reads every runtime file against the accepted ZIP, manifest SHA and Git blob. Its actual post-publication receipt is separate from the local package acceptance recorded here; reusing the cache is not a fresh clone.

Extract the complete download, serve the folder containing `index.html`, `assets/` and `_headers` with `python3 -m http.server 8080`, and open `http://localhost:8080`. The deployable folder is the complete runtime; no live site deployment was performed.

## Visual and device limits

Aircraft remain authored 3D models, photographic figures/foliage retain finite billboard poses and camera-angle limits, and procedural geography/repeated surfaces remain visible. The selected Alcatraz cell view is schematic, not a photographic replica of the supplied twin-platform cell. Expanded guides intentionally cover part of the view; a held weapon can still cross the lower hint. The screenshots support their exact scenes, not a universal photographic/movie-quality or zero-overlap claim. Actual iPhone Safari, physical-device performance and hardware FPS remain untested.
