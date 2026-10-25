# Jungle scenery and clear survival training

[Download the private complete game](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/jungle-training-site.zip) (GitHub sign-in required).

[Recorded verification](jungle-training-tests.json) · [CPU inventory and results](jungle-training-cpu.json) · [Runtime manifest](jungle-training-build-manifest.json) · [Eight reviewed renderer images](jungle-training-screenshots/).

Photographic trees now load during flight as well as on foot. Whole-tree cutouts replace the rounded vegetation meshes, while a new transparent overhead crown supplies leaf and branch detail when viewed from above. The overhead image is generated artwork, preserved alongside its lossless runtime derivative. Upright trunks, original world collisions and the bounded graphics budgets remain in place.

The village photographs guide reconstructed small bamboo and thatch outbuildings: crossed wall laths, posts, shaded verandas, shutters and overlapping ragged roof bundles replace the warehouse-shaped procedural hamlets. Their original small collision plots remain unchanged. These are architectural interpretations; the supplied photographs are not pasted onto the scenery, and the new exteriors do not add enterable houses.

Wildlife is integrated into ordinary eligible jungle encounters and **Ready Room → Jungle survival practice**: boar, tiger, krait, cobra, pit viper, scorpion, centipede and weaver ants. Warnings, contact effects, avoidance and supported weapon responses use actual terrain and line of sight. Snake impairment calls for rescue; this update does not add an antivenom or medical-treatment system.

With the equipment carried, **F draws the pistol**, **V selects the knife**, and **T / left click** or the visible **FIRE .38 / STAB KNIFE** button performs the selected attack. **Space** punches with a free hand; empty hands alternate right and left. Reach and walls still decide contact. Accepted punches record wounds, briefly stun and slow a wounded pursuer, and give a short hit response in the existing radio. A free-hand punch does not spend pistol ammunition.

Choose **Solitary survival** for a short, achievable practice: eat the ration, complete a mental project, finish seated exercise and breathing, decode a message, send a reply, rest two simulated hours, and observe the corridor. **WIN**, the earned task count, and the next action stay visible. At **7/7**, Goals offers **Return to Ready Room** or **Continue captivity**. This practice result is separate from campaign escape, transfer and historical release.

Choose **Watch solitary survival** to see the computer perform those activities through their ordinary controls. Its controls remain available inside activity panels. Other demonstrations keep their mission win requirement and actual objective progress visible above the expandable route guide. Practice demonstrations isolate campaign progress and saves.

The ration tin is visible on entering solitary. Look down and hold **F / Interact**, then choose **Eat today’s ration**. The existing daily meal affects condition, leaves an empty tin, and reports the next serving day. The world photograph remains a horizontal surface rather than a volumetric food model.

The second aviator receives a modest outward impulse at ejection, so the two opening canopies have room between them. Existing seat sequencing, independent landing, collisions and reunion behavior remain. A degenerate canopy crown was also repaired to remove black rendering tiles.

W. S. McConnell’s family-supplied expressions appear in appropriate existing B/N calls: “We’re in deep yogurt,” “I’m in a hurt locker!”, “Get the gold,” and “knuckleheads.” They are occasional dramatized dialogue, retain the useful tactical instruction, and use the existing American male voice selection when a matching system voice is available. They are not applied to Willard’s separately attributed historical crew.

Verification, exact runtime contents and selected native images are recorded with this release. Chromium desktop and phone layouts use the actual WebGL2 renderer; phone layout emulation does not establish physical iPhone Safari performance. Photographic vegetation still uses finite image planes, and procedural terrain, authored models and repeated materials remain visible. This update improves the checked scenes without claiming universal movie-quality graphics.

| Recorded scope | Result |
| --- | --- |
| Complete CPU runner | 1,094 passing cases across 91 programs; no failures, skips or cancellation |
| Native tutorial and HUD | 28 checks across two named suites |
| Native foliage | 8 flight/aerial checks and 10 final ground checks |
| Native weapon controls and damage | 33 checks across desktop and phone layouts |
| Solitary demonstration | All seven tasks earned; memory, exercise and tap cues visible beside controls; no campaign outcome granted |
| Ration and village exteriors | Both desktop and phone layouts checked for each |
| Original mission demonstrations | All twelve normal successful outcomes; 44 objective/storage checks |
| Exact packaged runtime | 29 checks and all 316 actual HTTP file hashes |

Final runtime source is `e400ac396f841a385f654cbc25d0b682ee992494`. CPU source and every executed CPU program, final ground renderer sources, UI sources and packaged runtime hashes match the final files. The twelve-mission run binds `b07f32ec15479c2d3b8fa176131e50c16cec6871`; subsequent production edits only refine roof colors and the wildlife-practice control hint. Mission rules, physics, attacks and success conditions remain unchanged. The later packaged-test change requires the eight complete botanical uploads in place of the deliberately retired normal-path vegetation atlas. Earlier failed tests remain preserved as diagnostics.

The opening-canopy run records 240 original update/render frames across two layouts. Its original whole-run `sourceStable:false` is retained because unrelated foliage code changed during that run. A separate exact-byte comparison proves all ten executed chute components remain unchanged in final source. This is scoped evidence, not a relabeled whole-application pass. The twelve-mission harness fast-forwards original simulation after native WebGL startup; it does not represent full-speed movie playback. These checks do not cover the entire browser registry or physical-device frame rate.

Runtime-only commit `1e08b3fbece09827310c11da517708fefaeeb0df` has the final runtime source as its sole parent. The `jungle-training-playable` tag marks the source documentation release. The local complete ZIP is 225,784,972 bytes with SHA256 `b6745febabd41025e277986e10a1f164012badbf8fe1b11d43f06a5ab505be24`; GitHub generates its own archive wrapper. ZIP CRC and every source/site/archive file hash pass. All 780 protected media/archive blobs, 77 earlier remote records and the preceding Coastal ZIP remain unchanged. No public site deployment is included.

Extract the complete game, serve the folder containing `index.html` and `assets/` with `python3 -m http.server 8080`, and open `http://localhost:8080`. The earlier [coastal scenery release](coastline-scenery-notes.md) remains available.
