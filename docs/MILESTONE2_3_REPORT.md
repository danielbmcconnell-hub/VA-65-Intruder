# Milestone 2.3 release and test report

**476 source-browser checks, 312 Node/VM checks and seven packaged-build checks passed.** The runtime-only ZIP contains 65 files and is 23.3 MB. Source suites completed incrementally; affected checks were rerun after corrections. Physical Windows and iPhone Safari, hardware performance and human difficulty remain unverified.

The release concentrates on the existing playable **cell → compound → rooftop → Hanoi → Red River** escape. It adds visual atmosphere, physical distractions and clearer action feedback without replacing the custom WebGL2 engine or the A-6A simulation. The prior flight missions, POW chapters, historical materials and local checkpoints remain part of the game.

[Play guide](MILESTONE2_3_PLAY_GUIDE.md). Playable runtime delivery: [Intruder_Yankee_Station_Milestone2_3.zip](../releases/Intruder_Yankee_Station_Milestone2_3.zip).

## Changes the player can see and use

- **Nighttime scenes:** warmer bulbs and lanterns, a sweeping compound searchlight, cooler exterior shadows, worn plaster, timber, shutters and riverbank detail. The river surface has moving ripples and changing reflections; the swimming surface and collision remain governed by the existing simulation.
- **Physical stealth:** collect three loose cell-floor stones and throw them toward a real target. A stone travels through space, collides with walls, roofs or the ground, and makes sound where it actually lands. Guards investigate that location when they hear it. Turning off a reachable lamp changes local illumination; covering the damaged door fitting can conceal fresh marks from guards who have not already noticed them.
- **Readable work:** the existing first-person artwork now follows actual door work, tool handling, rope use and swimming. Partial door work moves the visible bolt while the door remains solid; only completed work opens the passage. Releasing the control interrupts work. Door and rope holds are shorter, while equipment, reach and physical movement requirements remain.
- **Photographic figures:** POW guards, soldiers and civilians use the intact original photographic sheet with consistent proportions and grounded placement. Existing directional and posture images are combined with restrained movement and turning driven by real actor motion. Idle figures do not continuously walk in place.
- **Remembered projects:** completed automobile components, house stages and city work add visible details to the existing imagined environments. These details do not supply puzzle answers or complete activities for the player.
- **Sound:** quiet original ambience distinguishes enclosed cells, exterior nights and flowing water. Actual actor footsteps and reconstructed guard dialogue remain tied to real actors. Pausing, muting, opening a modal or entering an imagined environment stops the episode ambience; physical chapter changes crossfade the same bounded graph. It reuses the application's existing audio context.

The new work is divided into `episode-scene.js`, `episode-stealth.js`, `episode-actions.js`, `figure-motion.js`, `memory-detail.js`, `episode-audio.js` and the renderer's episode shader helpers. Flight rendering uses the original path when the episode profile is inactive.

## Preservation and historical boundaries

The complete A-6A physics, model, markings and eleven mission definitions remain subject to exact preservation checks. The original William S. McConnell tribute photographs, supplied historical images and source sprite atlases are preserved without re-encoding. No new historical photograph, recorded quotation or archival film claim is introduced.

The **October 12, 1967** Coker–McKnight escape remains the inspiration; George G. McKnight is identified as a U.S. Air Force captain, and their documented attempt ended in recapture. Compound architecture, lamp locations, guard schedules, dialogue, tools, distractions, numerical detection effects and possible successful escapes are authored gameplay. The detailed house, city and automobile scenes are imagined environments, not archival reconstructions. See the existing [historical notes](MILESTONE_2_2_HISTORICAL_NOTES.md), [source audit](MILESTONE_2_1_HISTORICAL_SOURCES.md) and [photo credits](HISTORICAL_PHOTO_CREDITS.md).

The photographic sheet does not contain a complete recorded walking cycle. The improvement uses its existing poses and modest authored deformation; it does not create or authenticate new photographic walking poses. Billboards still limit character realism. This clean-sheet motion upgrade applies to POW chapters; the older exterior-survival atlases retain their existing rough cutout detail.

## Verification record

All 21 suites have complete passing reports; failed or partial attempts are excluded.

| Browser suite | Passing checks |
| --- | ---: |
| renderer | 6 |
| missions | 22 |
| progression | 26 |
| ground | 11 |
| photos | 33 |
| prison | 21 |
| river | 14 |
| captivity | 15 |
| controls | 14 |
| awareness | 6 |
| m21 | 57 |
| m21-recapture | 8 |
| m22-onboarding | 46 |
| m22-escape | 12 |
| m22-river | 22 |
| m22-pacing | 22 |
| m22-flight | 22 |
| episode | 49 |
| episode-renderer | 14 |
| episode-audio | 42 |
| memory-detail | 14 |

The prior 17 suites total **357** checks. The four new suites total **119**: normal-patrol escape 49, active GPU fixtures 14, real Web Audio 42 and imagined-project detail/checkpoint 14. The complete escape traverses the original cell, corridor, stairs, rooftop, rope descent, Hanoi lane and river with guards, hearing, vision, pathfinding, collision and recapture active. Both layouts swim, dive, physically reach reed cover and rest at the covered landing. The phone layout also tests native looking, stick release, holds and taps; some route navigation uses keyboard injection with deterministic view steering.

The GPU fixtures use the unchanged original photographic people texture. Neutral tessellation retains visible character coverage, stride changes actual pixels, an opaque wall fully occludes the animated figure, warm lights switch off, a solid blocker casts a shadow, the fourth light remains visible on Low and a real searchlight cone changes illumination. Water pixels respond to time/current while its GPU coverage and physical geometry remain unchanged. These declared fixtures are distinct from normal gameplay screenshots.

Audio checks observe real AudioContext nodes through the original application graph, including native mute/pause/history, held diving, imagined scenes, Ready Room, Quick Flight and real WebGL loss/recovery. At most three cached ambience sources remain active. They test lifecycle and signal behavior, rather than subjective sound quality.

The expanded memory test earns notebook access by actual bunk work, switches the physical cell lamp off, enters imagined car/house activities, performs component/sample work, saves inside each imagined scene and resumes. Both layouts preserve the exact lamp setting, scene clock, physical position, earned choice and patrol memory. House, car and city decoration also follows actual completed activities and reloads without leaking imagined geometry into the physical cell.

Node/VM checks total **312**: core 9, ai 17, river 15, captivity 23, awareness 6, solidarity 23, morse 15, mindscape 10, regular 18, feedback 16, pacing 14, new-river 15, escape 6, coach 24, scene 18, stealth 15, actions 16, audio 15, motion 23, memory 7, buttons 7. These use isolated geometry, mechanics, recorded DOM and input-event fixtures. They do not substitute for browser rendering. Seven release checks verify every packaged file over HTTP with exact hashes/content types, fresh-default flight launch and stable native coach controls on both layouts, Ready Room prison entry, all new modules, checkpoint restoration and decoding 18 preserved game images plus eight supplied historical photographs. Final ZIP CRC, runtime allowlist and all 65 hashes pass. Rebuilding after the source commit retained every runtime byte already browser-tested.

Final review exposed missing Low-quality yard lights, scene settings omitted by saves made while imagining, and bolt-origin drift after unrelated scenery refresh. All three have passing regressions. Native touch Save then reproduced twice without a compatibility click; released-touch activation with click deduplication now passes the unchanged onboarding assertions. Cancelled, dragged, disabled and overlapping gestures are rejected; keyboard and hybrid mouse activation remain available. Other failed attempts involved declared fixture timing and water-quad winding and were corrected in the tests. No failed attempt counts above.

The preserved original flight launches and M2.1 coverage ran before the narrow final episode fixes; affected GPU, escape, memory, input and audio checks were repeated afterward. Exact source snapshots accompany the reports. Older prison/progression suites declare guard-duty, placement and calendar fixtures. Mission starts and short-flight debrief checks do not establish full combat-sortie completion or carrier traps.

Reproduce with `bash tools/setup-cloud.sh`, activate `.venv`, then `npm run test:assets`. `npm test` runs all 21 source-browser suites; `npm run test:episode` runs the new isolated and browser checks. Prior `test:pow`, `test:m21` and `test:polish` scripts retain earlier coverage. `npm run build` creates the runtime folder/ZIP and `npm run test:build` verifies its deployed bytes and startup.

Browser tests run the actual custom WebGL2 engine in Chromium with software rendering on Linux, using desktop and simulated iPhone layouts. New escape acceptance must keep normal patrols active and reach the river through player movement and held interactions. It is distinct from older declared-placement or away-duty integration fixtures. Node/VM checks exercise isolated mechanics and lifecycle fixtures; they do not establish GPU correctness or Safari behavior. Mission launch regression does not mean every combat sortie or carrier landing has been completed.

### Practical limits

Physical Windows Chrome and iPhone Safari, sustained hardware frame rate, rotation, audio quality and human difficulty or enjoyment are not established by cloud Chromium and touch emulation. These need device trials. Local checkpoints remain tied to the same website origin, browser and device.

Episode lighting is deliberately bounded: up to four scene lights and eight nearby solid boxes provide approximate visual shadows, with four boxes on Low quality. This visual approximation is separate from guard detection, which uses actual line-of-sight collision checks and local illumination. Decorative additions are non-solid and bounded to 64 in normal quality or 24 on Low. They do not replace the walls, doors or navigation collision.

## Update the existing Netlify game

No live Netlify deployment is claimed by this report. The existing address is [steady-croquembouche-46c1a0.netlify.app](https://steady-croquembouche-46c1a0.netlify.app/).

1. Download the Milestone 2.3 runtime ZIP from the delivered private GitHub branch or supplied attachment. On GitHub, open the ZIP file and choose **Download raw file**.
2. On Windows, right-click the ZIP and choose **Extract All**. Open the extracted runtime folder: `index.html`, `assets/` and `_headers` must be directly inside it.
3. Open the existing **steady-croquembouche-46c1a0** project in Netlify. In **Deploys**, upload that extracted runtime folder through manual deployment. Keep the existing project and domain; do not upload the source repository or test-evidence ZIP.
4. After Netlify reports the production deploy as published, open the existing game address. The browser title should read **Intruder: Yankee Station — Milestone 2.3**. Choose **Ready Room → Enter the prison** to try the improved episode.
5. If the old entry page appears, use **Ctrl+F5** on Windows or reload/reopen on iPhone. `?v=milestone2-3` requests a fresh entry page on the same save origin. Avoid clearing site data if you want to retain checkpoints.

Start iPhone testing in landscape on Medium graphics; use Low if needed. Verify movement, looking, held interactions and release, throws, lamp changes, photographs, sound, chapter resume and device rotation. Prior Netlify deployments remain available in the project's Deploys history for rollback. The runtime is static and needs no API key or game backend.

## Release identifiers

Tested source commit: `8d6c076dffa13e99c6d3086ec9e660fd9895a1ae`. Entry SHA-256: `2cba85f9c5d0938b1046cdb751f3cc388d59c39b9961d854c9e45c1b73bcca2b`. Playable ZIP SHA-256: `174abd3143531a17abb984932b30c475ba8cdd8bfe211da6b6e14807d8626574`. [All 65 runtime hashes](../releases/milestone2_3-build-manifest.json), [sample screenshots](../releases/milestone2_3-screenshots/), [full new screenshots/reports](../releases/Intruder_Yankee_Station_Milestone2_3_Evidence.zip) and [delivery summary](../releases/milestone2_3-summary.json). The evidence archive contains 32 normal-episode screenshots, 14 imagined-activity/checkpoint screenshots, 18 declared GPU fixture captures and four packaged startup screenshots, all 21 reports and verification logs. Earlier screenshot sets remain in the preserved prior evidence ZIPs.
