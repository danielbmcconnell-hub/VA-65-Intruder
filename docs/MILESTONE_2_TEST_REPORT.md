# Milestone 2 playable build · test report

Game-source commit: `ba5c2f2e29e8dba5e0fdeff939dccdbb8aa0be91`. Entry SHA-256: `a2083e20ef09c97f8a3c6c917b93b5672375de1871c7a632bf0c1c5cc8eefee2`.

The custom WebGL engine, A-6A model/markings, complete flight physics, all eleven mission definitions, original photographic atlases and eighteen tribute/reference photographs pass exact preservation checks. Three tested implementation commits add physical prison escape, the extended river journey, and interactive captivity. Milestone 1 remains available separately.

## Implemented and demonstrated

- First-person cell inspection, concealed bracket, timed physical door work, swept wall/door/body collision, corridor movement, continuous stairs/roof elevation, rope attachment/descent and a physically crossed Hanoi street to the river.
- Guard schedules, bounded collision-safe pathfinding, vision cones/line of sight, heard locations, investigation, remembered pursuit/search, delayed civilian reports and sustained close-contact recapture. Existing countryside NPCs also lose their former sight through buildings and stop tracking hidden player relocation.
- Real swimming/current displacement, 100:1 distance compression, diving/breath recovery, log hazards, fatigue, mudbank hiding and multi-day recovery. Dawn and the historical fifteen-mile benchmark do not force recapture. The tested uninterrupted river journey physically acquires a skiff, reaches the Gulf, approaches/signals an unnamed naval contact and completes a clearly labeled fictional rescue in approximately 16.4 simulated minutes.
- Recapture and ordinary flight capture enter an interactive narrow, permanently lit solitary cell. Night restraints constrain movement. Engine parts require dependency order, a four-stroke cycle and memory recall; house planning uses materials, structural/service choices and a budget; city placements need connected streets, separated utilities and transport; memory patterns become longer. Optional anchors, controlled physical exercises, timed rest, interviews, weekly/monthly changes, transfer and eventual 1973 release are playable.
- The historical five-by-five C/K-sharing tap code uses actual counted row/column pulses, decoding and transmission. Guard hearing can interrupt suspicious tapping. Checkpoints retain position, conditions, projects, contacts, chapter/river progress and guard memory; restoration cannot overwrite a valid save while still initializing.
- All six supplied historical WebPs decode unchanged at native proportions on desktop and emulated phone layouts. PNG masters and the Gemini-generated Coker interview summary are preserved; interview source links, colorization labels and historical/fictional boundaries are documented.

## Actual verification

**147 browser checks, 67 pure simulation checks and 5 packaged-build checks passed.** GPU tests execute the real renderer and game methods in Chromium; pure Node/VM fixtures do not validate graphics. Controlled positions, accelerated clocks, selected guard-duty homes and isolated encounters are explicitly described in each suite. These tests are not a human completion of every combat sortie or physical iPhone testing.

| Browser suite | Checks | Result |
| --- | ---: | --- |
| renderer | 6 | Passed |
| missions | 22 | Passed |
| progression | 26 | Passed |
| ground | 11 | Passed |
| photos | 14 | Passed |
| prison | 19 | Passed |
| river | 14 | Passed |
| captivity | 15 | Passed |
| controls | 14 | Passed |
| awareness | 6 | Passed |

Pure tests: core/checkpoints 8; guard AI/navigation 15; river physics/outcomes 15; captivity/puzzles/taps 23; original countryside awareness 6. Asset checks compare the supplied historical WebPs byte for byte, protect original photographs/atlases, verify derived alpha/RGB bounds and preserve flight/mission/model code.

The full browser runner passed its first eight suites, then stopped at a context-loss snapshot assertion that sampled before the asynchronous loss event. The fixture now records the actual loss event. The entire controls suite was rerun successfully, including real WebGL loss/restoration, rebuilt custom river meshes, cleared held touch actions and preserved player position. The remaining awareness suite was then run successfully. Current per-suite JSON reports identify every result and timestamp; no failed or unrun check is counted as passing.

The runtime-only ZIP is tested separately after packaging: exact HTTP hashes of every packaged file (including `_headers`), fresh-default desktop/touch flight, physical POW cell/checkpoint smoke, and decoding eighteen preserved images plus six historical images in each layout. All five packaged checks passed; all 48 runtime files match the manifest. The final deployment check result is recorded in the accompanying `build.json`. The playable ZIP is 22,289,476 bytes, SHA-256 `60b157363a58f6300ebafe8d2d91c3fb170f72fd6f3d9f94aa48d1ff142428ce`.

## Repairs discovered during integration

Corrected stair lip/roof floor clearance; elevated first-person/NPC/vegetation anchoring; civilian sprites being forced into guard identity by the old camp flag; close guard capture and repeated recapture state; visibility through buildings; gunshots granting global sight; inactive/zero-speed confinement input; stale modal/look state during load; non-atomic saves; direct prison entry retaining aircraft audio; touch controls obscured by the Dive button; visually merged tap pulses at coarse simulation steps; and held POW actions after graphics loss.

## Remaining limitations

Physical Windows Chrome and iPhone Safari, sustained device performance, rotation/safe areas, available Vietnamese voices, long suspension and human difficulty balance still require device playtesting. The cloud uses software GPU rendering; its speed is not a Windows/iPhone frame-rate benchmark. Existing photographic atlases have limited true gait artwork; navigation, turning, cadence and pose transitions are improved without claiming new full articulated photographic animations.

The compound/street/river layout, patrol schedules, dialogue, puzzle rules, condition meters, compressed travel and successful rescue are fictional gameplay. The October 12, 1967 Coker–McKnight episode ended in recapture. George G. McKnight is identified as a U.S. Air Force captain. The supplied summary was generated by Gemini; original interviews and authoritative archival sites could not be retrieved through the cloud proxy, so exact quotes and disputed details are not presented as independently verified. Original monochrome versions of the two colorized reference images were not supplied.

## Test and deploy

Read `MILESTONE_2_PLAY_GUIDE.md` and `NETLIFY_DEPLOYMENT_MILESTONE_2.md`. Download the playable ZIP, choose Windows **Extract All**, and upload the extracted folder containing `index.html`, `assets/` and `_headers` to Netlify. The evidence ZIP is separate. The task does not change the live Netlify site.

Reproduction: activate the project's Python virtual environment, run `npm run test:assets`, `npm run test:pow` (pure plus all POW browser suites), `npm test` (all browser suites), `npm run build`, and `npm run test:build`. Individual suites use `node tests/run-browser.cjs --suite=<name>`. Reports and actual WebGL screenshots are in `test-results/` and the delivered evidence archive.
