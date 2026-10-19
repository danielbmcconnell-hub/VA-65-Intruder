# Dixie strike — implementation and verification

This pass turns the existing Mission 02 into an optional complete B/N-led strike experience: briefing, original catapult launch, navigation fixes, target correlation, original ASQ release and ballistics, visual aftermath, another flown attack or egress, original carrier arrestment and measured debrief. The custom WebGL2 engine, twelve mission definitions, A-6A forces/model/markings, original photographs, earlier POW chapters and rooftop rope fix remain. [Play guide](DIXIE_STRIKE_PLAY_GUIDE.md).

## Implementation

- `assets/flight/strike-experience.js`, `.css`: unlocked guided entry in the Ready Room, full or short practice start, phase guidance, actual-position observation camera, original ripple and opening-turn commands, return intent, earned checkpoints and fresh-game retry/Continue. No target damage, designation, ASQ solution, arresting wire or result is synthesized here. A real pilot casualty exposes emergency guidance for the existing manual controls.
- `assets/flight/strike-scene.js`: grounded service roads/junction, water tower, sheds and parked trucks. A riverbank hamlet appears only when the actual generated river channel is nearby. The original target objects retain their coordinates and hit radii. Detailed depot meshes fall back to the original on unsuitable slopes. Real destroyed targets gain permanent rubble; burning targets alone gain embers and bounded local lighting. Existing smoke and secondary explosions remain authoritative.
- `assets/flight/strike-crew.js`, `.css`: measured navigation/steering acknowledgments, stabilized-run calls, precise consent-inhibit explanations, actual release/impact distinction and conservative camera/terrain visibility checks for aftermath observations. One bounded caption and optional browser speech; no added AudioContext, clock or uncontrolled queue. Dialogue is explicitly dramatized, never attributed as an authentic quotation.
- `assets/flight/strike-checkpoint.js`: bounded, validated saves preserve actual aircraft, fuel, damage, stores, target state/positions, layout, score, carrier, navigation, clocks and station. Pending bombs must settle before capture. Corrupt records and retired games cannot overwrite a good save. A retry constructs a new Game, keeps its callbacks and clears old projectiles/FX caches.
- `index.html`, `assets/flight/strike-board.js`: additive integration using existing rendering, public chart, original pilot, original LOCK/ASQ mechanics and original debrief. The opt-in version suppresses duplicated legacy chatter and staged spectacle while retaining actual mission defenses and audio. The ordinary mission launch retains the player's saved seat preference.
- Test runner, package builder, package scripts and new domain/browser suites: register the additions and include all six new runtime files in the complete game. Dependencies and lockfiles are unchanged.

Scenery is authored representative 1960s terrain context, not a surveyed historical depot. Service/civilian buildings are not extra cleared targets. Neither the worksheet nor new mission guidance grants hidden target identity or an identification score bonus. The original Mission 02 briefing still governs daylight visual identification and weapons clearance.

## Defects reproduced and repaired

The original pilot could couple ACLS purely by distance while approaching the carrier's bow. ACLS then had no astern approach to fly, so the aircraft could coast past, orbit and eventually crash. A full input-driven diagnostic reproduced it. The guided sortie now requires the existing stern approach's lateral, heading, height and range envelope before capture; coupling remains latched through the original wire event. The existing pilot and landing controller remain authoritative. Ordinary missions retain their earlier coupling behavior.

Opening range for another attack can bring the aircraft near the ship without returning. The guided sortie now gates recovery announcements and phase entry on actual return intent or empty stores, avoiding misleading LSO calls during a reattack. Carrier objective text derives the carrier from the briefing; Mission 02 correctly names Constellation.

Native testing also reproduced Space being swallowed by a focused new ripple button. New action bindings release focus after activation, allowing subsequent keyboard consent to reach the original control path. Touch actions use the established released-pointer helper and compatibility-click deduplication. The phone action row and worksheet toggle occupy separate bands. A later touch compatibility click could restore button focus after pointerup; a dedicated click listener now clears focus even when the helper suppresses the duplicate action. Native mouse, touch and paired-keyboard consent checks reproduce and verify both cases.

The checkpoint tests reproduced the original catapult timer's normal small negative undershoot. Saves preserve that measured value instead of requiring a fabricated exact zero or altering the aircraft to make a save valid. Browser capture and fresh-world restore were tested separately from mocked domain fixtures.

Actual Low-quality GPU testing found static scenery could consume the complete instance budget before embers were submitted. Nearby genuinely burning embers now receive slots first, displacing distant static detail within the same 72/108/132 total limits. The corrected frame draws real embers without increasing the budget; cold ruins retain geometry after the original fire expires.

## Actual verification

| Verification | Result |
| --- | --- |
| Node/VM/DOM domain checks, 38 suites | **686 passed** |
| Existing native radar/opacity, all eleven earlier mission starts and progression regressions | **60 passed** |
| Genuine guided sorties, controls, checkpoint retry/reload, ordinary Mission 02 and practice | **26 passed** |
| New actual WebGL geometry, ruin, mobile-budget and context restoration fixtures | **12 passed** |
| Total selected source-browser checks, five suites | **98 passed** |
| Exact packaged runtime: 141 HTTP hashes/content types and desktop/touch original flight, prison/photos, Willard and new Dixie controls | **13 passed** |
| Original photograph/atlas bytes, historical mission definitions and complete A-6A physics/model/markings | **Passed** |

Both deterministic Standard guided sorties completed in **434.55 simulated seconds (7m15s)**: eight of twelve Mk 82s released, three hits/five misses, three of five depot targets destroyed, actual one-wire arrestment, both crew alive, **A / 98 points**. Touch proof uses trusted touchscreen input and also verifies a paired keyboard's Space consent after tapping flight actions. No target-health, result, wire or aircraft-position setter is used in those successful sorties.

The full-sortie report records one coherent version of each tracked runtime file. The later isolated ember-budget correction is covered by the final 17 scene-domain checks, 12 GPU checks and packaged checks; do not describe the earlier full sorties as having used that later scene hash. Passing counts exclude reruns and earlier diagnostic failures. This is a selected regression run, not a claim that all 31 registered source-browser suites were rerun.

The browser acceptance uses native UI and the original Game update, B/N-seat pilot/ACLS, radar sweeps, lock, ASQ gates, ballistic bombs, target damage and wire event. A fixed-step clock compresses waiting and seeded uniform randomness controls repeatability. Public briefing coordinates and displayed radar cells assist the automated B/N; no hidden target ID is used to aim, and no aircraft teleport, target-health edit, forced result or fake arrestment is accepted. Short practice explicitly has an airborne initial condition and is tested separately.

Domain/DOM fixtures are distinct from genuine browser sorties and GPU evidence. Earlier regression checks run incrementally; final source hashes and packaged checks identify the release bytes. Diagnostic failures, including the focused-Space reproduction and an actual pilot casualty after repeated single-bomb passes, are preserved separately and excluded from passing counts. A real casualty is not repaired into a winning test.

## Limits

Browser testing uses Linux Chromium/SwiftShader with desktop and 844×390 DPR3 touch emulation. Physical Windows, iPhone Safari/WebKit, hardware frame rate, rotation/backgrounding, subjective speech/audio and human difficulty need device trials. Browser synthesized voices may be absent; subtitles and the existing sound system remain usable. Shared browser speech APIs cannot individually cancel an utterance if unrelated speech has entered the same global queue; the optional feature defaults off.

This is one polished optional sortie; the same treatment has not been applied to all twelve missions. Ordinary older missions retain their original pilot behavior. New scenery uses the existing collision fidelity and adds no building-collision model. Some original photographic countryside cutouts remain rough. Checkpoints rewind to a recorded state; they do not promise an uninterrupted mid-bomb save. Existing historical/photo source qualifications remain in earlier reports.

## Delivery and deployment

Branch **`dixie-strike-experience`**; preserved baseline/tag `dixie-strike-start` at `0d88e4a411b471724ce40dacde69db52221c185f`.

Tested final runtime source commit **`f707d50773b4d58e28fcb0a6cfe900f469bb2a64`**. Earlier tested stages: scenery/crew `67bc3af`, integrated mission `686924e`, hybrid-input focus `00960cb`. The final delivery commit adds this report and artifacts; all runtime bytes match the source commit above.

**[Download the complete Netlify ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/dixie-strike-experience/releases/Intruder_Yankee_Station_Dixie_Strike.zip)** — **34,724,072 bytes**, **141 runtime files**; private GitHub sign-in required.

ZIP SHA-256: `2bb91e40b5eb2783308e20f22c37195f3694addfd98a8c6fa4e244693d121667`.

Entry SHA-256: `e63ae27e9d3f2a033a477384eb842a1aede2ebdf2a63cb118bd57a065b2fbdab`.

[All runtime hashes](../releases/dixie-strike-build-manifest.json), [delivery summary](../releases/dixie-strike-summary.json), [twelve selected screenshots](../releases/dixie-strike-screenshots/) and the separate evidence ZIP accompany the playable build. CRC, exact allowlist and runtime bytes were checked before transfer; independent private Git download/history verification follows the push.

The complete deployment ZIP uses an explicit 141-file runtime allowlist. It excludes Git metadata, reference archives, dependencies, development tooling, reports and test evidence. Deploy the playable ZIP's extracted contents, not the evidence ZIP or entire checkout.

On Windows sign into the private repository, download, **Extract All**, then upload the folder containing `index.html`, `assets/` and `_headers` to the existing Netlify project's **Deploys** page. Confirm the title **Dixie Strike** and the Ready Room's **BRIEF THE GUIDED STRIKE** entry. Git-connected alternative: branch `dixie-strike-experience`, command `npm run build`, publish directory `dist/site`. Keep the existing origin for saved progress and retain an earlier deploy for rollback.

The live https://steady-croquembouche-46c1a0.netlify.app/ has not been redeployed by this Git/file delivery. Static gameplay requires no Codex subscription, API key or backend.
