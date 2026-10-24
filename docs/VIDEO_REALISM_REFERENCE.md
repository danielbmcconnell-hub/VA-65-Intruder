# Carrier footage as a game reference

The later three night-combat uploads are reviewed separately in [Night-combat video references](NIGHT_COMBAT_VIDEO_REVIEW.md), including their distinct source hashes, observed events and proposed game improvements.

Three smaller uploaded recordings could be inspected visually. The observations below come from timestamped still frames, not an audio transcript or a frame-by-frame measurement of an entire landing. Source recordings and extracted frames remain outside the deployable game. Their photographs can guide geometry, materials, animation and staging without inserting a recording's camera cuts into player-controlled flight.

## `IMG_8182.mov`: carrier landing

Source SHA256: `b46a375411c0a73e6e6f9c006c82d771281f68f4a5c7eb0cc8ec4083c1b0c7b2`. The 9,697,934-byte recording lasts about 11.92 seconds. Twelve stills were inspected at 0.2, 1.2, through 11.2 seconds. The source-bound extraction receipt is retained with development evidence.

| Recorded time | Visible reference | Useful game application |
| --- | --- | --- |
| 0.2 s | Elevated stern view of the whole deck, parked aircraft, island and wake | Check carrier proportions, opaque deck coverage, shipboard viewpoint and the relationship between deck height and ocean. |
| 1.2–8.2 s | Steady, nose-high approach with landing gear down, over a foamy wake, seen from the ship | Tune approach attitude and relative scale; retain continuous aircraft motion while the carrier moves beneath the approach. Use the wake as an optical reference rather than moving the aircraft to suit a camera cut. |
| 9.2 s | Aircraft crosses the stern/ramp | Check deck-relative ramp clearance, wheel contact and the hook's path across the moving landing area. |
| 10.2 s | Visible tire smoke at deck touchdown | Trigger a short tire-smoke event from actual wheel/deck contact, accompanied by a bounded touchdown camera response. |
| 11.2 s | Short rollout near the island | Guide the transition from approach to roll and arrestment, with crew and aircraft remaining attached to the carrier's moving frame. |

The sampled frames do **not** establish the complete arresting-stop duration, cable force, exact approach speed, sink rate or landing grade. These values must come from the game's physical state and suitable aircraft/carrier data. A missed wire should produce a physical bolter with retained forward motion and usable power; a successful trap should follow an actual lowered-hook crossing and cable arrestment. The clip can help assess the resulting visible motion, but the numerical arrestment model is not measured from these twelve stills.

## `IMG_8179.mov`: carrier, launch and flight

Source SHA256: `c5e1b053588096c256d588c7e2b18096c96ead4ba35f0b6658123e5363c60dd0`. Eight stills were inspected at 0.5, 4.5, through 28.5 seconds in a recording lasting about 31.43 seconds.

| Approximate portion | Visible reference | Useful game application |
| --- | --- | --- |
| Opening, roughly 0–7 s | USS Kitty Hawk underway, its bow, island, air wing and wake | Improve carrier scale, ocean contact, wake placement and distant presentation. |
| Roughly 7–19 s | A-6 on the catapult, steam, dark non-skid deck, yellow-shirt directors and kneeling crew | Keep the deck opaque; place steam at deck height; use complete crew photographs with role-appropriate signals, inspection and safe positions. |
| Roughly 19–22 s | Aircraft leaves the bow from a deck-level viewpoint | Check launch camera height, uninterrupted acceleration, deck clearance and the transition to airborne flight. |
| Roughly 22–31 s | Loaded A-6s bank and fly in formation; pale weathered Navy surfaces | Improve aircraft-local materials, curved shading, banking silhouettes and formation framing. |

The recording's visible aircraft numbers and markings are reference material, not replacement VA-65 markings. The game retains its historical A-6A/Kitty Hawk setting. Aircraft surfaces must remain attached to their own local coordinates as they bank and translate; scenery-style world-coordinate texture wear should not slide across the airframe.

## `IMG_8184.mov`: short night landing/rollout reference

Source SHA256: `d0a1efaa37dc72f16f265781fc7f037e84bd3964486fd6d6e6f8ac5b11fbfc36`. The 2,051,010-byte recording lasts about 2.27 seconds. Twelve technical stills were inspected from 0.0 through 2.2 seconds at 0.2-second intervals.

| Recorded time | Visible reference | Proposed night refinement |
| --- | --- | --- |
| 0.0–0.2 s | Mostly dark A-6 silhouette and red/green navigation lights, seen from ahead | Preserve a readable aircraft silhouette against the night sky, with correctly oriented port/starboard navigation lights and restrained ambient exposure. |
| 0.2–0.4 s | Brief white wheel/tire smoke visible against the lights | Let an actual wheel-contact smoke event catch nearby deck lighting, then disperse; avoid treating a whole rollout as continuous tire smoke. |
| 0.4–2.2 s | Warm deck lighting progressively reveals the cream-gray nose, canopy, gear and stores; bright deck lights and reflection streaks accompany a short rollout and camera pan | Use spatial light falloff across the moving aircraft, warm deck fixtures and restrained reflection streaks. A smooth shipboard tracking camera could reveal the airframe while retaining continuous physical motion. |

These are **proposed** night-presentation refinements. No additional night-lighting or camera implementation is claimed from this review. The very short recording does not show a complete arresting stop or a FLOLS/meatball display; it cannot establish arrestment duration, cable force, approach glideslope or a landing grade. Its audio was not independently assessed.

## Access and audio limits

`IMG_8178.mov` and `ScreenRecording_10-24-2026 11-53-31_1.mov` exceed the file-transfer tool's 32 MiB limit and were not viewed. The linked YouTube page remains blocked by the managed network proxy despite an authorized access attempt. No transcript or spoken content from those sources was reviewed.

Audio was not independently transcribed or assessed for any of the smaller recordings. Tire, cable, engine and LSO timing recommendations are based on the depicted events and the current game code, not a claim that particular sounds were heard in these clips.
