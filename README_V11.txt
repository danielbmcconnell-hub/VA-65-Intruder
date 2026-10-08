INTRUDER: YANKEE STATION — V11 TACTICAL REPAIR

This edition repairs several problems observed in the user's V10 gameplay screenshots:
- The second survival-card portrait now uses the original supplied high-resolution JPEG.
- Foreground first-person fists, .38 revolver, and knife/fitting illustrations appear on foot.
- New PUNCH/FISTS selection; the FIRE/ATTACK button attacks with the selected item.
- Close-range VC/NVA awareness, with line-of-sight blocking by walls.
- The crashed A-6 has separate fuselage and wing collision shapes.
- Distant old low-polygon tree meshes are culled on foot. Nearby photographic vegetation is grounded to terrain.
- Staggered opponents pause briefly before resuming movement.

GROUND CONTROLS
Touch: FISTS, KNIFE, PISTOL choose the equipment; ATTACK/FIRE uses it.
Keyboard: P = fists, V = knife, F = draw/holster pistol, Space = attack/fire.
Move: W/A/S/D or touch stick. Run: SHIFT. Crouch: C / button.
Radio: R / button. Smoke: G / button. Surrender: X / button.

WEB VERSION / NETLIFY
Extract this ZIP, then upload the FOLDER that contains index.html AND assets to Netlify.
Refresh Safari completely after deploying; verify the title says V11 TACTICAL.
Do not upload only index.html—the WebP atlas files must be alongside it in assets/.
A hosted game may be accessible by anyone with its URL, depending on hosting settings.

STANDALONE VERSION
The companion standalone HTML embeds the WebP atlases and first-person weapon artwork.
Some phone file previews block advanced graphics and scripting: Safari via a hosted URL is recommended.

TESTING
JavaScript syntax, photographed image data, SVG source integrity, and code-level collision,
awareness, and attack tests were checked. Full iPhone WebGL gameplay was not executable in
this sandbox, so visual/physics behavior must still be confirmed on your device.
This is an improved sprite-based WebGL game, not a fully remade AAA 3D engine.
