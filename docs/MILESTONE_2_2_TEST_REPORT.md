# Milestone 2.2 test report

**Playable release:** [Netlify ZIP](../releases/Intruder_Yankee_Station_Milestone2_2.zip), 23.3 MB, 57 runtime files. [Play guide](MILESTONE_2_2_PLAY_GUIDE.md), [deployment instructions](MILESTONE_2_2_NETLIFY_DEPLOY.md), [changes](MILESTONE_2_2_CHANGES.md), [historical boundaries](MILESTONE_2_2_HISTORICAL_NOTES.md).

**357 source-browser checks, 209 Node/VM checks and seven packaged-build checks passed.** The source tests completed incrementally, with corrected failures followed by affected reruns. This is actual Chromium WebGL2/SwiftShader execution on Linux with desktop and simulated iPhone layouts. Physical Windows and iPhone Safari, hardware performance and human difficulty balance remain unverified. Mission launch checks do not establish full combat-sortie completion or a carrier trap.

## What changes in play

The Ready Room offers four playable chapter starts and an optional tutorial earned by looking, walking, completing an interaction and releasing the control. Separate chapter saves preserve campaign progress, including migration of older saves. Practice endings appear as practice in the Cruise Log and do not award Mission 11 completion.

The subsequent escape offers cloth-muffled work through a covered washing passage or faster, louder workshop work. Both require tools, held actions, physical passages and boundary crossing. Normal guard schedules remain active. Sound/sight cues come from observable actors; ordinary permitted yard movement no longer incorrectly attracts investigation, while running and illicit hardware work still do.

The river has differing sections, active ferry patrols and physical covered landings for rest. Quiet swimming and crouched bank movement give useful alternatives to exposure. Older checkpoints retain positions and patrol memory without being trapped by new scenery. Captivity can earn earlier time compression, but messages, changed guard duty, interviews and discoveries interrupt it; puzzles, counted communication, meals, observation and rest still matter.

Interaction targeting favors the object being faced; the cell bed is reachable beside other activity targets. A compact condition drawer, reticle and original first-person working-hands artwork make control feedback clearer. Guard movement transitions and idle scanning use existing photographic figures. No new photographic walking poses were created. Optional flight coaching reads original instruments and adds measured debrief advice without changing aircraft controls, physics or grades.

## Browser results

| Suite | Passing checks |
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
| recapture | 8 |
| onboarding | 46 |
| escape | 12 |
| river-polish | 22 |
| pacing | 22 |
| flight | 22 |

The first twelve suites total **233 original/previous-chapter regressions**. The five new gameplay suites total **124 checks**. They cover real movement, aimed and timed work, patrol responses, collisions, river current, cover, rest, checkpoint reload, earned pacing, counted communication, recapture, captivity transfer and subsequent escape. Twenty-two flight-coach assertions were verified in stages: eleven desktop before the mobile section-width fix, then eleven touch-layout checks after it. The final packaged tests additionally verify the finished button/section geometry through native input on both layouts.

The new escape-route tests keep every normal patrol active; they neither move guards away nor write success flags. River tests start at the river, then use physical movement/current and real landing holds with normal patrols. Onboarding uses actual keyboard, mouse-look/turning and CDP touch movement/holds. Some phone-layout route tests use keyboard injection for navigation. Older progression tests declare placement, calendar and away-duty fixtures; these are integration checks rather than unassisted human playthroughs. Practice accounting includes an explicitly labeled terminal-callback fixture, while physical river/rescue and recapture outcomes are tested separately.

Node/VM checks use isolated simulation, DOM and geometry fixtures: core 9, AI 15, river 15, captivity 23, countryside awareness 6, solidarity 23, Morse 15, mindscape 10, regular confinement 18, feedback 16, pacing 14, river polish 15, alternate escape 6 and flight coach 24. Their total is **209**. Morse includes a recorded DOM fixture; actual signal rendering is exercised separately in browser tests. These checks do not validate a GPU or physical Safari.

## Final package and preservation

Seven checks verify every packaged file over HTTP, fresh-default flight launch on both layouts, native flight-guidance toggles with stable targets, actual Ready Room prison entry, checkpoint restoration and decoding eighteen preserved game images plus eight supplied historical photographs. No missing local runtime assets, JavaScript exceptions or WebGL errors were observed in the passing release checks. ZIP CRC, entry allowlist and all 57 hashes passed after packaging.

Exact preservation checks pass for all eleven mission definitions, complete A-6A physics/model/markings, original tribute photographs and photographic atlases. The six enhanced historical WebPs and two supplied color PNGs retain their supplied bytes. References, archive, dependencies, Git and test evidence are excluded from the playable ZIP. Existing releases remain unchanged.

Initial test attempts exposed the shifting touch toggle, unreachable bed target, excessive quiet-movement noise and outdated monthly-routine test controls. These were corrected and verified. Save review found legacy checkpoint loss, inherited practice identity on campaign resume and practice awarding mission progress; all have explicit passing regressions. Other fixture corrections concerned asynchronous saves, touchscreen finger-release sequencing and screenshot timeouts under concurrent software rendering. Only complete passing reports count above. A Google Fonts request encountered the cloud certificate proxy; local fallback fonts remain usable.

## Reproduction and remaining limits

Run `bash tools/setup-cloud.sh`, activate `.venv`, then `npm run test:assets`. `npm test` runs the seventeen actual-browser suites. `npm run test:polish` runs new domain checks and gameplay suites; `npm run test:m21` preserves the earlier extended checks. `npm run build` creates the runtime-only folder/ZIP; `npm run test:build` verifies its bytes and browser startup. The server needs no game API key or backend.

Schematic environments and the existing photographic artwork still limit visual realism. Physical Windows/iPhone Safari, rotation, background/resume, audio/voice availability, sustained frame rate and player difficulty feedback need device trials. The historical source audit is unchanged; schedules, layouts, dialogue and successful escape routes are explicitly fictional. There is no new claim of archival authentication.

The existing Netlify address has **not** been redeployed. Upload the extracted runtime ZIP to the existing project's Deploys page to test these changes. Saves remain local to the same origin/browser/device.

Tested source commit: `3db8c0145eb393b66c9a8e0763290492de02d9da`. Entry SHA-256: `80f2697e7ddf49aa38b339c20ca35e17e1af6a08027dd83a5991e75184cc7aa1`. Playable ZIP SHA-256: `efd593db7fbf613ac3d58ba2f9746c9fc0938fc7a32cdc0ebd8075c5d7f00da6`. See `releases/milestone2_2-build-manifest.json`, the delivery summary and evidence archive for per-file hashes, reports, scopes, logs and screenshots.
