# Milestone 1

## Original photographs and development baseline

- Exported clean photographs/insignia from supplied originals and the untouched archived game; no re-encoding or AI imagery. Restored standing debrief portrait, ready-room/history portrait, all twelve cruise photographs, insignia and fallback figure PNG.
- Preserved source photographs and original atlases. `assets/photos/manifest.json` records source, SHA-256 and dimensions.
- Removed photograph filters, bottom fades and title overlay; photographs retain their aspect ratio.
- Added a restricted local HTTP server and pinned browser tooling. The server serves only the runtime HTML/assets and does not expose family reference folders or Git history.
- Verified: strict Pillow decode of exported files, exact source/hash checks and Chromium decode of all 18 assets. Visually inspected the title screenshot. Further screen/progression checks follow in this milestone.

## Rendering and progression repairs

- Depth-tested opaque photographic sprite interiors, smoothly blended edges, exact atlas pixel bounds, natural proportions and visible-bottom ground anchors. Conservative derived alpha masks preserve every original photographic RGB pixel; incomplete NVA poses use the original game's clean full-body photographic figure sheet. Compatible poses avoid cycling through cropped/dead frames. Vegetation labels/fragments and broken canopy selections removed.
- Balanced graphics target allocation/deletion; reduced default touch shadow memory; recoverable WebGL loss preserves missions and pending terminal/narrative transitions. Held controls clear in place so keyboard handlers remain connected.
- Repaired finite NPC facing, armed-local capture/surrender, weapon inventory and queued touch actions, wall-blocked combat, static-safe contact pushes, frozen cell input and camp timing.
- Repaired Mission 11 objectives, recapture lifecycle, hidden first-contact follow-up cards and escape outcomes; fixed Cruise Log scope error and crew recovery reporting. Bomb load now matches the briefed Mk82 count/None. Delayed callbacks respect the active mission.
- Corrected the dedication's displayed VA-65 service dates to 1968–1969, as supplied by the user; mission definitions and historical A-6A model/physics preserved exactly.
- Verification: original/derived asset hashes, strict decoding and RGB comparisons; actual WebGL shader pixels, occlusion, graphics resource lifetimes/context recovery; 22 mission starts/launches; ground/collision/combat regression fixtures; desktop/touch progression screenshots through SAR, prison, solitary retry, escape and debrief. Final totals and manual device limits are in docs/MILESTONE_1_TEST_REPORT.md and test-results/ JSON.
