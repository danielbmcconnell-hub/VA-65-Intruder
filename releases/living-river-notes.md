# Living river and carrier opening

[Download the private complete game](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/living-river-site.zip). The exact tested local ZIP is `dist/Intruder_Yankee_Station_Living_River.zip`. Extract the folder containing `index.html` and `assets/`, run `node assets/local-server.cjs`, then open `http://127.0.0.1:8000`. The included server needs Node 20 or later and supports video byte ranges. The preceding [Prison Water release](prison-water-notes.md) and original uploaded media remain intact.

The opening uses three short portions of the uploaded carrier footage: catapult departure, carrier approach and night recovery, totaling 12.2 seconds. It plays silently after entering the Ready Room, once per browser session. Skip returns immediately; Pause and a Ready Room replay button remain available. Reduced-motion settings suppress automatic playback. Starting a mission closes the viewer. Clips illustrate carrier operations; they do not replace the player's flight or imply that a mission has been completed.

The supplied fishing-boat photos guided original curved plank-built sampans, woven-canopy boats and blue wooden workboats. Boats move, rock, paddle, cast nets and leave wakes. Seated photographic paddler artwork and weathered wood are original generated assets, with full-resolution sources preserved. No stock watermark was removed or stock image copied into a game texture. Hulls have real swept collision and block sight lines; boats avoid spawning over the swimmer and retain an open central channel.

Fishers can notice exposed movement and warn before a delayed call. Dive or break sight behind a hull, log or reeds to interrupt a clear sighting. Only an actual nearby armed NVA soldier can investigate a successful call; fishers do not create soldiers or award automatic capture or damage. River civilians own a separate actor list and never enter the prison guard roster. Prison stages continue to use NVA soldiers only.

Riverbanks now layer tall trees, full photographic rear canopies, nipa, bamboo, ferns, exposed roots and reeds. Close jungle undergrowth fills the walker’s surroundings, while nearby trees retain real branches and photographic leaf clusters. Quality levels bound tree, leaf, texture and sampling work. Shore access and the original collision boundaries remain available.

Route-driven bank encounters use the existing photographic animal poses and behavior: boar, snakes and a rare tiger encounter. Warnings precede contact. Animals stay on the banks and cannot injure a swimmer from land. These and the existing crocodile encounters are fictional gameplay hazards rather than claims about historical animal prevalence on this escape route.

| Action | Controls |
| --- | --- |
| Skip opening / close replay | Skip to Ready Room / Close footage, or Escape |
| Watch carrier clips again | Ready Room → Watch reference footage |
| Move and strafe | WASD or movement stick |
| Swim hard | Shift or Swim hard |
| Dive in river | Hold Space / DIVE; release and surface before air empties |
| Use floating cover | Near a log or foliage: F / Take cover |
| Escape a hull obstruction | Swim sideways around it or dive below it |
| Defend against a close crocodile | T / DEFEND |
| Punch on land | Space with an empty hand; T / left click / PUNCH in fists mode |
| Fire pistol / stab | F draws pistol or V selects knife; T / left click / labelled FIRE .38 or STAB KNIFE |
| Toggle instructions | H, or Help in cockpit/camp/pause menu |
| Aircraft cameras | 1 Pilot, 2 B/N, 3 external A-6 |

Spoken voice mode no longer adds chopped synthetic chatter when a speech line is suppressed or the device has no matching voice. Natural installed American male and Vietnamese voices remain preferred; unavailable lines stay as captions. Tones is a separate synthetic radio-effects option. Voices still depend on installed system speech, not newly recorded actors.

Physical iPhone Safari, hardware frame rate and subjective voice quality remain untested. The graphics use a mix of reconstructed geometry and photographic materials/sprites; they do not establish film-level photorealism throughout the game.


[Verification summary](living-river-tests.json) · [Source coverage](living-river-source-coverage.json) · [Exact build manifest](living-river-build-manifest.json) · [Reviewed images and fixture labels](living-river-screenshots/index.json).

| Recorded scope | Result |
| --- | --- |
| Complete CPU runner | 1,215 passing cases across 101 programs |
| Moving boats, swept collision, paddle poses, diving, bank wildlife, pause | 14 desktop/phone native checks |
| Rooted jungle, real rear-canopy photographs, banks and access routes | 8 desktop/phone native checks |
| Actual montage decoding/completion, Skip/Replay/Next and voice dispatch | 14 native checks |
| Exact complete-game package | 38 checks, all 347 files served with matching hashes |
| Original river practice controller | Full river/delta/offshore signal and rescue, all 18 traffic stations; 5 scoped checks |

The route verification begins at the original river practice entry and then fast-forwards original updates, movement, collisions and objective code. It grants no successful outcome. Flight/ejection and prison escape objectives are outside that run.

Runtime source is `5fc56898000fb0b29bad8acb2f72fb6a5215844e`. The local complete ZIP is 240,667,614 bytes with SHA256 `e57b57b04e26b5bc1bce5739090fbc8779e97117575bcf35a8c6f64669220d2a`. GitHub supplies a different outer ZIP wrapper. All 820 previously protected media/archive blobs, 89 previous published ref records and the earlier Prison Water ZIP are checked separately by the delivery receipt. The three original carrier uploads are also preserved byte-for-byte under `reference_media/carrier-clips/`, outside the runtime allowlist. No public site deployment is included.

Repeat the feature suites with `npm run test:living-river`; use the [portable verification helpers](living-river-verification/README.md) for the complete CPU inventory or scoped river route.

Runtime-only commit `a3de27b743bec79079235a20ffc510555a24bbca` has the tested source as its sole parent. The `living-river-playable` tag marks the documented source release. [Local delivery integrity](living-river-delivery.json) records ZIP CRC, exact runtime bytes, all previous protected media/ref checks and the unchanged Prison Water ZIP.

[Delivery status](living-river-delivery-status.json): the source branch, runtime branch and release tag were uploaded after explicit user approval. [Independent post-fetch verification](living-river-post-fetch-delivery.json) reads every one of the 347 uploaded runtime files and compares its bytes with the tested ZIP and manifest. All previous protected media/ref records and the historical verification checkout remain unchanged. Previous published releases remain available.
