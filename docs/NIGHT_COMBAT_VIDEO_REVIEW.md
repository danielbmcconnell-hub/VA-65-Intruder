# Night-combat video references

The three later uploads share the filename `ScreenRecording_10-24-2026 13-27-22_1.mov`, but contain different footage. They are recorded separately below. This is a visual review and source-code audit; the recommendations are not new runtime features. The verified combined download remains unchanged.

The original recordings and native-resolution technical stills remain outside the deployable game. Source receipts identify each recording by its SHA256, size and duration. The screen recordings are 2868×1320 at 60 FPS; that does not establish the original production's frame rate or the number of unique animation poses.

## Latest upload: attack and aftermath

Source: **10.18 seconds**, **18,593,096 bytes**, SHA256 `50c60cccc15eed749bb64c6b7bad1a915a0dfd7bd2c1a8efa61f73a008919188`. Eleven sampled frames were inspected at 0.1-second offset, one second apart through 10.1 seconds.

| Time | Visible observation | Useful game improvement |
| --- | --- | --- |
| 0.1–1.1 s | Two airborne aircraft seen from ahead against a dark blue sky | Improve apparent scale, silhouette and continuous relative motion. Their precise relationship and spacing are not established by these frames. |
| 2.1–3.1 s | Round amber display with terrain/map-like shapes and bright sweeps or streaks | Refine readable returns, persistence, glass and instrument framing. Retain the game's actual sensor data; confirm the historical instrument and phosphor color independently. |
| 4.1 s | Helmeted, masked aviator under red light | Add restrained instrument-to-outside glances and bracing poses using the game's established aviator identity. Preserve complete helmet, mask and hose silhouettes. |
| 5.1 s | A hand grips a control, with its thumb at a button | Synchronize a deliberate hand action with the actual control command. The image does not establish the exact button or prove that a weapon has already released. |
| 6.1 s | Brief bright illumination across the helmet and face | Use short local illumination from a real nearby event, followed by a prompt return to normal night lighting. Keep instruments readable. |
| 7.1 s | Dark ground and horizon | Improve terrain separation and motion cues in low light. No flight altitude can be measured from this shot. |
| 8.1–9.1 s | Ground equipment site explodes; antenna/dish structures break amid flash, smoke and debris | Give damaged sites distinct intact, burning and destroyed appearances, triggered by actual damage. Coordinate the visible result with the existing emitter and objective state. |
| 10.1 s | Return to the red-lit aviator | Show recovery from the flash while maintaining continuous aircraft motion and player control. |

The useful sequence is **instrument work → deliberate command → physical result → local flash → damaged site**. Edited shots do not prove the weapon's travel time, exact trajectory, blast force or the causal connection between every depicted action. The game should retain its own targeting, consent, stores, collision and damage rules.

## Second upload: incoming trails and airburst

Source: **13.806667 seconds**, **22,240,712 bytes**, SHA256 `1baf9ac85195a567797f0782a7b16d881fe7ba7775dc5311555158efc97e9eed`. Eight sampled frames were inspected at 0.1, 1.1, 3.1, 5.1, 7.1, 9.1, 11.1 and 13.1 seconds.

Cockpit views show several bright curving trails against a blue night sky. A red display reads **TARGET ACQUIRED** and **RANGE TO TARGET 2.2 MILES**. Crew close-ups alternate with the outside view; a later rear aircraft view shows nearby trails, followed by a large airburst.

Useful applications are readable missile motion and persistent trails, brief outside flashes reflected in the cockpit, and coordinated crew attention. An airburst should produce appropriate visual and camera feedback according to the game's actual distance and damage calculation; an edited explosion shot does not establish a confirmed aircraft hit. The red display's labels and numerical range are film imagery, not validated A-6A instrument specifications.

## First upload: launch and warning

Source: **5.168333 seconds**, **6,253,320 bytes**, SHA256 `4374522a7323498eb41354afb0038c2f0dd78722a3551b71989566f4323467cd`. Eleven sampled frames were inspected at 0.1-second offset, half a second apart through 5.1 seconds.

| Time | Visible observation | Useful game improvement |
| --- | --- | --- |
| 0.1–0.6 s | Dark aircraft silhouette against blue-gray clouds | Retain silhouette and cloud separation with restrained ambient illumination. |
| 1.1–1.6 s | Ground missile launch, narrow bright exhaust, expanding smoke and bright sparks | Separate the exhaust flare from the growing ground plume. Drive the effect from a real launch event; film pyrotechnics do not establish normal spark quantity or missile performance. |
| 2.1–2.6 s | Bright red rectangular **MISSILE** annunciator | Reinforce an actual launch warning with a discrete, readable lamp. Radar activity alone must not become a confirmed missile launch. |
| 3.1–4.1 s | Helmeted, masked aviator in red cockpit light | Use restrained scanning/reaction poses and situational crew delivery. |
| 4.6–5.1 s | Red-lit panel and a round green instrument display | Improve readable glow, framing and surface detail. The green display's exact function is not independently established. |

## Existing systems and the next concrete work

The current implementation already has real SAM projectiles, launch smoke/glow, amber **SAM RADAR** and red **SAM LAUNCH** warnings, different radar/launch tones, CRT persistence and calm/alert/urgent voice profiles. Those features should be refined together rather than replaced by prerecorded film cuts.

| Priority | Source finding | Proposed change and validation |
| --- | --- | --- |
| 1 | The launch call in `Game.postUpdate` always says “four o'clock.” The HUD already calculates relative emitter bearings. | Derive the call from the actual launch position and aircraft heading. Check all twelve clock sectors, heading wraparound, overlapping launches, call rate and pause behavior. Preserve missile physics and existing warning eligibility. |
| 2 | `World.launchSam` creates a generic explosion and ground smoke; `World._weapons` emits missile glow/smoke every update. | Add a distinct exhaust/plume and coherent trails with bounded time/distance-based emission. Verify comparable density at 30/60/120 Hz, bounded resources and unchanged projectile/damage behavior. |
| 3 | The HUD differentiates radar and launch warnings; cockpit and crew presentation can communicate their urgency more coherently. | Coordinate the existing warning with a modest lamp, appropriate voice delivery and optional crew glance. Verify that launch, radar-only, warning-cleared, paused and disabled-voice states remain distinct on desktop and touch layouts. |
| 4 | The attack sequence can use the existing targeting and damage systems. | Synchronize control-hand poses with actual consent/release; synchronize antenna damage, smoke and emitter/objective changes with actual impacts. Confirm that holding consent is not presented as a confirmed release or hit. |

Relevant production code is in [index.html](../index.html): `World.launchSam`, `World._weapons`, `Game.postUpdate`, `Game.hudState`, the B/N Direct View Indicator and radar persistence. Situational voice selection is in [voice-profiles.js](../assets/audio/voice-profiles.js).

An optional replay or demonstration camera could show launch, evasive motion and impact while ordinary play retains continuous control. Create original effects and poses for the game's historical A-6A, VA-65 setting and established crew identities. The channel marks, recommendation overlays, actor likenesses and helmet lettering are not game assets.

Audio was not independently transcribed or assessed. Proposed warning calls, engine/exhaust sounds and impact cues are game-design recommendations, not a claim that particular dialogue or sounds were heard. Film identity, equipment variants, sensor performance and numerical flight/weapon parameters remain unverified.
