# Prison, water and strike realism

[Download the private complete game](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/prison-water-site.zip). Extract the folder containing `index.html` and `assets/`, serve it with `python3 -m http.server 8080`, and open `http://localhost:8080`. The previous [Cockpit Focus release](cockpit-focus-notes.md) remains intact.

Bombs now have a longer, larger visible burst at their actual impact point, with rising smoke and debris. Destroyed fuel sites produce delayed rolling orange blasts; ammunition sites produce sharper flashes and sparks. Existing damage, hit counts and score remain authoritative. Cosmetic bursts have their own bounded particle pool, so they do not displace original effects or consume their random draws. Concrete bridges and plain radar structures do not acquire imaginary fuel stores.

| Action | Controls |
| --- | --- |
| Show/hide instructions | H, or Help in the cockpit/camp/pause menu |
| Move and strafe | WASD or movement stick |
| Look / turn | Mouse, right-side drag, Left/Right arrows |
| Run | Shift or Run; direction remains under movement control |
| Aircraft camera | 1 Pilot, 2 B/N, 3 long A-6 view, or Cockpit view buttons |
| Punch on land | Space with an empty hand; T / left click / PUNCH in fists mode |
| Fire the pistol | F / Pistol draws; T / left click / FIRE .38 fires one round |
| Use the knife | V / Knife selects; T / left click / STAB KNIFE stabs/cuts |
| Rope work | Hold F / Interact at the actual rope and anchor; then watch the continuous descent |
| River dive | Hold Space / DIVE briefly; surface before the air meter empties |
| Floating cover | Swim near a log or foliage; F or Take cover; release F, dive or swim hard to let go |
| Crocodile defence | T / DEFEND when it is within reach; two accepted strikes drive it away |
| Ocean rip practice | Ready Room → Practice escaping a rip current |

Camera selection changes the view; it preserves the pilot/B/N mission role. Help starts off and preserves its preference. Warnings, condition meters and action controls remain available. American English uses an explicitly male US voice when the device provides one. Natural/premium voices take precedence; neutral pitch, cleaner phrasing and fewer interruptions reduce artificial delivery. These are installed system voices, not newly recorded human actors; their availability and sound quality depend on the device. Vietnamese remains Vietnamese, with situation-dependent delivery. Captions remain available when a matching voice is absent.

Prison stages use North Vietnamese soldiers; civilians and other historical game encounters remain outside prison. Both closed and opened cell doors remain visible. Rope work uses actual twisted cylindrical strands, photographic open/closed grips and a continuous path over the parapet and down the wall. Swimming uses eight full-resolution paired-arm poses and displacement-driven water sounds; drifting alone does not produce strokes.

Riverbanks slope into the water with uneven mud, exposed roots, reeds and existing photographic foliage. Visible armed observers can fire across the river; diving stops those shots while using real breath. Floating cover reduces visibility and noise. Crocodiles are occasional fictional gameplay encounters based on the supplied visual references, not a claim about their historical prevalence on the depicted route. The new crocodile artwork is an original generated eight-pose atlas; no stock watermark was removed. Source PNGs and exact lossless WebP derivatives are retained. The prison/escape layout remains a playable reconstruction rather than a surveyed historical prison plan.

Rip currents push along the surface, without forcing the swimmer underwater. Swim parallel to shore to clear the narrow flow, then return diagonally. Stop propelling to float and regain strength; signal for help when necessary. The Ready Room lesson awards completion only after actual movement clears the flow. The computer demonstration uses the same swimming controls.

[Verification records](prison-water-tests.json) · [Exact runtime manifest](prison-water-build-manifest.json) · [Reviewed native images](prison-water-screenshots/).

| Recorded scope | Result |
| --- | --- |
| Complete CPU runner | 1,166 passing cases across 97 programs |
| Views, Help, movement and water | 20 desktop/phone native checks |
| Rope, cover, crocodile, diving and doors | 10 native checks, including actual DEFEND tapping |
| NVA prison roster and outside civilians | 12 native stage/render checks |
| Mission tutorial UI | 16 checks across desktop/phone layouts and all 12 previews |
| Real World impact/cook-off rendering | 10 isolated WebGL comparison checks |
| Original mission outcomes | 12 earned outcomes; 44 checks with a separately replayed M8 recovery |
| Exact packaged runtime | 33 native/HTTP checks; all 335 files served with matching hashes |

The campaign run fast-forwards original physics and objective code after native WebGL startup. It grants no position, damage or successful outcome. M8 completed its strike near the old 1,800-second bound; a separate fresh original strike and recovery completed successfully, and both records are retained. The outcome run predates the last surface-eye-height, temporary cover spacing and presentation refinements. Final CPU, native interactions and package checks cover those refinements. A final M11 demonstration attempt lost the B/N to ordinary small-arms fire before ejection; demonstrations retain real combat risk. [Source coverage](prison-water-source-coverage.json) records these boundaries and preserves that diagnostic.

The river/rope/door tests use declared original chapter or checkpoint fixtures. The bank-fire component fixture holds an existing observer on a clear bank sight line; the dive then uses original updates. Explosion comparisons use isolated copies of real World/FX and the actual renderer; they are not screenshots of a player-released sortie. Neither those fixtures nor a CPU test count establishes that every possible playthrough will succeed.

Runtime source is `f30d389cf22d1fdfd40c43b9c41a29ca1ceb17b2`. The complete local ZIP is 235,086,084 bytes with SHA256 `a4fcfc3c37b932c295360f7b96be8999f295430e875a5f897b7a2cd9046c4353`. GitHub creates a different outer archive wrapper. The preceding Cockpit Focus ZIP, 810 protected media/archive blobs and 85 old published ref records are preserved; the delivery receipt is recorded separately. No public site deployment is included. Physical iPhone Safari, hardware frame rate and subjective listening quality remain untested. The update improves materials, anatomy, movement and clarity; it does not establish photographic fidelity for every scene.


To repeat the complete CPU inventory, run `node releases/prison-water-verification/run-all-cpu.cjs local`. The native feature checks are available through `npm run test:prison-water`; `node releases/prison-water-verification/run-missions.cjs m1 m2 m3 m4 m5 m6 m7 m8 m9 m10 m11 willard` replays original mission controllers. The portable helpers use the same executed logic with repository-relative output paths.
