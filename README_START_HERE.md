# Intruder: Yankee Station — Living River update

The latest update is on `living-river`: [complete private game download](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/living-river-site.zip) · [features, controls and verification](releases/living-river-notes.md). It adds a short skippable carrier montage, moving Vietnamese fishing boats, bank wildlife and denser layered jungle. After extracting the download, run `node assets/local-server.cjs` and open `http://127.0.0.1:8000`. Actual iPhone Safari remains untested.

# Intruder: Yankee Station — Codex handoff

The preceding private game update is on `prison-water-realism`: [complete game download](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/prison-water-site.zip) · [controls, verification and limits](releases/prison-water-notes.md). It adds clearer bomb bursts and fuel/ammunition secondaries, directional ground controls, selectable aircraft views, toggleable instructions, NVA prison rosters, visible rope work, photographic swimming and playable river hazards. Actual iPhone Safari remains untested.

The preceding [Cockpit Focus release](releases/cockpit-focus-notes.md) remains available.

The preceding [jungle training release](releases/jungle-training-notes.md) and [coastal scenery release](releases/coastline-scenery-notes.md) remain available.

Earlier release history and the original handoff follow unchanged.

The photographic movement, useful pickups, aircraft, jungle and prison realism release is on `night-realism`. See [the current report](docs/NIGHT_REALISM_REPORT.md) for the private complete-game download, source-bound verification and graphics/device limits. Actual iPhone Safari remains untested.

The preceding combined wildlife, jungle, carrier and survival release remains on `wildlife-jungle`. See [its report](docs/WILDLIFE_JUNGLE_AND_CARRIER_REPORT.md) for source-bound verification, the private complete-game download and scope limits. Actual iPhone Safari remains untested.

The preceding photographic movement release remains on `highres-fluid-movement`. See [the motion report](docs/PHOTOGRAPHIC_MOTION_REPORT.md) for the complete pose inventory, timing behavior, reproducible checks and deployment instructions. The original transfer notes below describe the earlier baseline; use the current report and recorded evidence when assessing those issues. Actual iPhone Safari remains untested.

## Baseline

This folder is the **V11 Tactical** web build (index.html + assets/), the last downloadable integrated code version in the earlier conversation. Do not assume it is fully functioning merely because previous summaries said tests passed. Actual iPhone gameplay and photorealistic asset behavior require verification.

Open `index.html` through a local development HTTP server, rather than an iOS file preview. Do not start from the standalone HTML when refactoring: edit this web project.

`archive/original_user_game.html` is the user's initial uploaded game. Keep it as a comparison/back-up, not the default entry point.

`reference_photos/` has clean user-provided photo files to replace damaged embedded images. Validate which image belongs in each screen by comparing visually to the user-provided screenshots. These files are personally significant. Preserve originals without re-encoding or applying graphical effects.

## Architecture / constraints

- Large, mostly monolithic HTML/JavaScript custom WebGL 2 engine, **not Three.js**. Inspect actual source before editing.
- Both flight mission and on-foot escape/evasion gameplay; iPhone Safari with landscape touch controls is primary.
- Sprite atlases in `assets/` include farmer, female VC, militia, NVA, aviator, cow, vegetation, and first-person weapons.
- Core historical setting: U.S. Navy **A-6A** Intruder, VA-65, USS Kitty Hawk, 1968-1970. Don't substitute A-6E geometry or unrelated unit insignia.
- Existing features should be preserved unless changes are necessary for a tested bug fix.

## Known unresolved or inadequately verified issues reported by the user

1. One or more portraits remain visually corrupted, including a debrief/survival-card photo. Repair from original JPEGs here; do not infer transparency/CSS alone is the culprit: inspect embedded bytes, image mappings and CSS.
2. Photographic NPC sprites can be patchy, stiff, low-resolution, or poorly animated. Examine atlas frame variation, UV extraction, alpha mask, world size, and animation state transitions.
3. Player or guards can clip through prison walls, scenery, aircraft wreckage, people. Create collision tests and in-engine browser tests, not just static code assertions.
4. VC/NVA sometimes ignore the player at very close range; patrol/nav logic and reactions may be brittle.
5. Fists/pistol/knife first-person visual states and hit detection need polish. Current representations are stylized rather than photographic.
6. Floating trees/billboards and low-poly placeholders still appear in places.
7. Recapture and solitary confinement, farmer/cow interactions, Sandy/Jolly Green behavior, footsteps, speech, and audio need end-to-end playtesting.
8. The latest gameplay video and screenshots are supplied separately in the media reference archive.
9. Gameplay on actual iPhone Safari has **not been independently validated** by this transfer.

## First Codex task

1. Inventory the code paths, state transitions, rendering pipeline, and assets. Do not implement new features yet.
2. Make a Git baseline commit and introduce a development server/test scripts.
3. Reproduce the broken photo and replace only the incorrect image data with the clean original.
4. Create a smoke test for title -> ready room -> briefing -> flight -> ejection -> ground -> capture -> escape, with clear errors.
5. Fix the remaining issues incrementally with diffs, tests, and reviewable commits.

## Safety and privacy

This is a private personal project featuring family photographs and possibly sensitive historical material. **Create a PRIVATE GitHub repository** and review files before publishing or deploying. Do not make the media archives public by default.

## Handoff from ChatGPT

Earlier changes were made as iterative HTML builds (V1–V11), not as a maintained, well-tested repository. Summaries of 'fixed' issues are claims to verify, not proof of production-grade behavior. Prefer a reproducible test-first workflow. No code has been rewritten during this transfer.
