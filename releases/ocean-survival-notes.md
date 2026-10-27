# Ocean survival, Navy rescue and clearer views

This update follows [Living River](living-river-notes.md). The exact complete-game ZIP is `dist/Intruder_Yankee_Station_Ocean_Survival.zip`; the private runtime branch is `ocean-survival-site`.

All three fishing hulls now have continuous, opaque wooden floors sealed to their tapered sides, above the river surface throughout their small rocking motion. The original working skiff also has an upward-facing floor. Water no longer renders through the open interior. Hull shape, civilian behavior and physical collision remain unchanged.

At the ocean, the offshore craft has US Navy hull markings and an American ensign. Approach within 100m, face it and hold **F / Interact** at **Wave clothing to the US Navy boat**. A visible cloth waves while recognition builds. Remain at the surface and hold position; diving, moving away, turning away or losing sight interrupts recognition. Recognition speed depends on condition, weather, light and signaling material. Reaching the sea alone does not grant rescue.

When the Navy watch acknowledges you, physically reach the orange buoy off its stern and hold **F / Interact** to take the rescue line. A skiff must slow down for pickup. Acknowledgement and actual pickup are separate, measurable steps. The existing successful continuation remains explicitly fictional; the historical Coker–McKnight escape ended in recapture.

NVA and VC riflemen remain on the last actual shore while you approach, wave and reach pickup. They acquire an exposed target, warn and fire real tracers along current sight lines. Rifles have bounded range and reduced long-range accuracy. Diving stops the coastal shots; floating cover, hulls, weather, distance and line-of-sight obstacles matter. Skiff passengers remain exposed and should paddle or use hull cover. Fire stops after rescue is complete. Coastal VC are outside the prison; prison guard rosters remain NVA-only.

The existing carrier montage, fishing boats, river wildlife, jungle, controls and previous releases remain available.


Popups now stay in peripheral rails. Press **H** or use **Popups: ON/OFF** in Camp, cockpit or pause controls. This includes warning captions; the centre view stays clear. Action buttons, condition meters and a compact Navy recognition/pickup indicator remain available with popups off. The preference persists, and pause/results dialogs remain accessible.

Box and fire jellyfish drift in both the initial open-ocean survival scene and the final offshore rescue area. Look for pale box bells and amber fire jellyfish, then steer clear of their bodies and tentacles. Their positions and contact tests are physical; near misses do not cause timed damage. Stings reduce crew health and swimming strength, or POW physical condition and fatigue. Diving through tentacles can still sting. Fields have spawn clearance and contact cooldowns; the final pickup buoy remains clear. Surface optical projections and small three-dimensional bell caps make the animals visible through the game's opaque water, with full photographic side views underwater. This is a bounded game representation, not a biological survey or medical simulation.

Common male dialogue now uses **116 original locally generated neural clips** across consistent navigator, pilot and radio roles. English dialogue, crew expressions, Navy rescue and jellyfish warnings use these performances where a matching clip exists. Dynamic lines use suitable installed natural male system voices; low-quality Fred/eSpeak/Compact/Desktop voices are rejected, and unavailable lines stay as captions. Spoken mode no longer adds a beep after every line. Playback is shared across the game, with priority interruption, duplicate suppression and engine ducking. The first neural-dialogue update upgrades legacy Tones once, preserves Off, and respects later intentional settings. These are generic synthesized voices, not recorded actors, family voice clones or authentic historical audio. Source WAVs, transcripts, licenses and provenance are retained; model weights are excluded from the game.


## Download and play

[Download the complete private game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/ocean-survival-site.zip). Sign into the GitHub account with repository access. Extract it, run `node assets/local-server.cjs` from the extracted directory, and open `http://127.0.0.1:8000` in a WebGL2 browser. The carrier opening is skippable; the preceding river, jungle and prison features are included.

The GitHub archive wraps the verified runtime tree in a folder and has GitHub-generated archive metadata. The exact local package has these recorded properties:

- Tested source: `38e4fcc50408cd85c832ac317b74a156b1f9c5ca`.
- File: `Intruder_Yankee_Station_Ocean_Survival.zip`.
- Size: **245,424,393 bytes**; **476 runtime files**.
- SHA-256: `dbef7fe553f1ae9abe4de5b9b04c6fe182ace473639f6ffb56ae035d4de33e70`.

## Verification

| Check | Passed | Actual scope |
| --- | ---: | --- |
| CPU | 1,262 cases / 105 programs | All CPU-only node:test and legacy assertion programs; legacy programs contribute file-level runner cases |
| Boat floors | 21 | Real indexed hull geometry, production water/materials and desktop/phone WebGL2 old/new comparisons |
| Navy rescue | 10 | Native keyboard and touch holds, actual gulf crossing, both shore factions, interrupted waving/diving, acknowledged approach and earned line pickup |
| Jellyfish | 16 | Actual ocean ejection and gulf chapter checkpoint; visible surface/underwater art, native avoidance, both contact stings, dive and pause |
| Popups | 12 | Native H/menu/pause controls, persistence after reload, central view, functional actions and touch target sizing |
| Neural dialogue | 8 | Three bundled male roles actually fetched, decoded, started and completed at normal playback rate on desktop/touch layouts |
| Exact package | 40 | All 476 files served with exact hashes; flight/prison/photos/mission smoke, carrier video ranges/metadata and three neural roles decoded |
| Original river route | 5 | Original practice entry and MissionDemo controller earn river/delta/offshore signal/recovery in 775.32 simulated seconds, passing all 18 fishing stations |

The [test summary](ocean-survival-tests.json), individual JSON reports, [source coverage](ocean-survival-source-coverage.json), [build manifest](ocean-survival-build-manifest.json), [CPU log](ocean-survival-cpu.log) and [76 screenshot records](ocean-survival-screenshots.json) are retained. The [portable verification helpers](ocean-survival-verification/README.md) describe reproduction.

Recorded source hashes match the final tested code except one explicitly accepted difference: the popup report precedes the final jellyfish sea-surface interpolation correction. That module is inactive in the popup suite's stream/flight scenes; all popup code, CSS and entry HTML match. The final jellyfish, CPU, floor, Navy, route and package reports cover the corrected module. All reports were source-stable during execution, with no recorded browser errors or missing assets.

These are actual Chromium WebGL2 desktop and emulated phone-layout checks, not physical iPhone Safari or hardware FPS measurements. Native suites declare their chapter checkpoints and close-organism/camera fixtures; the initial-ocean underwater camera is a renderer fixture, not evidence of a dive control there. The river controller starts at the original river practice entry, runs original physics/objective code, and waits for real jellyfish artwork before proceeding offshore. It is not a complete flight/capture/camp campaign replay. The successful offshore escape is fictional.

Playback checks prove real neural audio execution, not subjective listening quality or human-actor recording. Dynamic speech also depends on installed system voices. The voices are generic synthesis; photographs, original media, legal notices, source audio/transcripts and previous releases are preserved. Runtime excludes model weights, source WAVs, generators and private reference folders.


## Delivery integrity

The [local delivery receipt](ocean-survival-delivery.json) binds all 476 runtime files to the tested ZIP and runtime commit `1786de360c4c0c87512914eb3918220938b61c7e`, whose sole parent is the tested source. ZIP CRC and every file SHA-256 passed. All 846 protected media/archive blobs, all 93 preceding published-ref records and the earlier Living River ZIP remain unchanged. Source documentation commits may follow the tested code without changing any packaged assets, tests or tools.
