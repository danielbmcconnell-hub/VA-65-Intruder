# Milestone 1

## Original photographs and development baseline

- Exported clean photographs/insignia from supplied originals and the untouched archived game; no re-encoding or AI imagery. Restored standing debrief portrait, ready-room/history portrait, all twelve cruise photographs, insignia and fallback figure PNG.
- Preserved source photographs and original atlases. `assets/photos/manifest.json` records source, SHA-256 and dimensions.
- Removed photograph filters, bottom fades and title overlay; photographs retain their aspect ratio.
- Added a restricted local HTTP server and pinned browser tooling. The server serves only the runtime HTML/assets and does not expose family reference folders or Git history.
- Verified: strict Pillow decode of exported files, exact source/hash checks and Chromium decode of all 18 assets. Visually inspected the title screenshot. Further screen/progression checks follow in this milestone.
