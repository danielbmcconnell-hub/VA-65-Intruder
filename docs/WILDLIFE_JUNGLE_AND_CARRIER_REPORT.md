# Wildlife, jungle, carrier and survival integration

The combined game is packaged from source commit `e0e0314143ca9900726d5a8e8397f81b6489a72a` with **287 runtime files**. [Download the complete private game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/wildlife-jungle-site.zip) (GitHub sign-in required). Exact checks, scope and hashes are recorded in [release evidence](../releases/wildlife-jungle-tests.json) and the [runtime manifest](../releases/wildlife-jungle-build-manifest.json). Earlier source/runtime branches and all 34 previous release ZIPs remain unchanged. This delivery does not update the live Netlify site.

## Graphics and movement

The existing six subjects retain their complete standing/aiming/fallen photographs and 192 walking/running poses. Movement follows actual travel distance, so collision, pause and stopping do not continue a stationary walking cycle. NVA, militia/VC and the aviator each add eight complete horizontal swimming poses: 24 photographs across six plates. A separate full-body aviator photograph depicts suspension in a parachute harness. Swimming and suspension are registered separately from walking poses and use the same bounded texture cache. The original 192 land-movement registrations remain unchanged.

Wildlife adds eight types: wild boar, tiger, krait, cobra, pit viper, scorpion, centipede and weaver ants. The authored collection contains 124 movement/threat poses in 31 plates, plus a separate woven-leaf nest photograph. Boar and tiger have separate sixteen-pose walk and run clips; smaller creatures have eight crawling poses, and the three snakes also have four threat poses. Generated source PNGs remain unchanged. Exact lossless WebP encoding preserves every decoded RGBA byte, including hidden RGB beneath transparent pixels. Source-bound whole-figure registration keeps each photograph intact and prevents neighboring figures entering a pose. Explicit tiger camera-scale registration corrects documented source-camera variation without changing image pixels.

Six botanical photographs provide canopy, bamboo, nipa, ferns, lianas and leaf litter. Layered placement, nearby shaded forest soil and horizontal litter surfaces improve the forest floor. Ground paint and vegetation use the same dry-jungle habitat, excluding river channels and flood banks. This avoids treating a wet river channel as a painted forest floor. Visible solid trunk cores participate in collision; placement and queries are bounded. Existing terrain heights and original private/reference photographs are preserved. Its source-bound full wildlife/jungle browser report is retained with the release evidence.

The deck-crew collection contains six complete high-resolution role photographs and twenty additional signal/inspection/walking poses. Carrier aircraft, crew, steam and the deck share the ship's moving frame. Aircraft-specific local materials and corrected smooth normals improve the existing A-6A, A-1 and HH-3 geometry without replacing their markings or flight physics.

The landing candidate uses deck-relative contact and a lowered hook's swept crossing of an arresting wire. A successful crossing starts a bounded cable-arrestment rollout rather than immediately setting aircraft velocity to zero; a missed wire retains forward motion for a bolter. Touchdown smoke, sound and camera feedback follow actual landing events. The carrier geometry work also addresses a hull crown that could protrude through the flight deck: a solid deck requires correct opaque geometry as well as an alpha value. Final native launch/recovery and actual renderer checks, including their declared fixture scope, are retained in the source-bound release evidence.

The approach guidance follows a gravity-stabilized glidepath anchored to the carrier's moving aim point. It uses the preceding completed ship-motion interval for aim-point velocity, rather than extending a pitching deck plane far behind the ship. Optical guidance and LSO feedback share that reference. This addresses incorrect guidance during pitching-deck approaches; physical ramp, hook, wheel and cable contact still determine whether the aircraft lands safely. Final source-bound sortie and storm-fixture evidence must be consulted for its verified range of conditions.

People, larger wildlife and crew still use photographic billboards rather than fully articulated 3D models. Small wildlife and litter use terrain-aligned surfaces. These are generated photographic pose reconstructions guided by supplied references, not filmed animation sequences; they do not guarantee a correct photographic view from every possible camera angle. The existing Sandy/Jolly rotor blur uses static blade/disc geometry with native transparency; it is not a new physically animated rotor system. Their existing opaque glazing remains a visual limitation.

## Survival and controls

The wildlife simulation uses habitat-aware seeded encounters, visible warnings and bounded temporary injuries. It distinguishes a boar charge, rare tiger stalking, defensive small-animal contact and a localized ant nest. Existing weapons use actual targeting, line-of-sight and ammunition; animals do not become invisible human patrol actors. The simulation stops under menus, pause, capture and incompatible prison stages.

Tree landings can catch a parachute on actual nearby canopy geometry. The suspended aviator receives a cutaway control; releasing the harness resumes a gravity-driven drop with bounded branch/fall injury. Ocean movement uses immersion, a lower wave-following camera and movement-driven splashes. River movement supports physical bank exits and a limited number of warned NVA/VC pursuers entering the water.

Ordinary land patrols check terrain before spawning or walking, and an ocean landing skips terrestrial farmer/militia first contact. A rescue-smoke signal at sea remains at the water surface and does not create walking ground reinforcements or an unsupported ground-threat warning. The river's deliberate pursuit/entry mechanics remain a separate water-capable path. The ocean-roster CPU fixtures verify the actual spawning, movement and smoke methods; focused ocean browser evidence remains supplementary to the complete, source-bound two-profile survival report.

Both surviving aviators eject with separate physical descent paths. A reunion depends on proximity and visibility, followed by Follow/Wait controls, collision-aware movement and patrol warnings. Rescue of the second aviator requires reaching the cable and boarding, rather than assuming a distant companion is also rescued. The historical mission's separation remains distinct from this optional teamwork.

The controls legend accepts pointer/touch input, has an explicit close control and can be toggled again. Demonstration, companion and cutaway cards have Hide/Show controls, leaving the required flight or survival controls accessible.

## Voices and demonstrations

In the Ready Room, choose a mission under **Watch a mission demonstration** and select **Watch demonstration**. Explanations follow the actual action; they can be hidden, paused or stopped, and the player can take the controls. Completed practice saves and checkpoint retries remain isolated from campaign progress, including the replacement game and its later debrief.

English speech selects an explicitly recognized male United States voice available in the browser. British, unknown and female default voices are not substituted. If a matching voice is unavailable, captions and the existing radio sound remain usable. Vietnamese speech stays Vietnamese. Calm, alert and urgent delivery adjust the available voice's timing and emphasis; this does not add recorded voice actors or guarantee that every device has suitable installed voices.

The demonstration director exposes all twelve missions and explains controls and objectives while using the game's normal flight, targeting, stores, collision and mission-result paths. All twelve registered missions reached their authoritative success outcomes in the source-bound demonstration evidence, using ordinary game update, physics, weapons, objective and storage paths. The evidence separately identifies native controls, CPU fast-forward and declared visual fixtures; controller/domain tests alone are not presented as mission-completion proof.

The ordinary weapons path also corrects a point-release dispersion bug: a single bomb uses normal single-store scatter, independent of unrelated neighboring targets, while a multi-bomb area ripple retains its broader physical spread and intervalometer. The same correction applies to player flight and computer demonstrations. The original ASQ solution, consent, store consumption, trajectory, blast damage and authoritative mission outcomes still determine the result; the correction does not inject target kills or mission success. Its domain tests are separate from actual sortie-completion evidence.

## Video references

[The timestamped carrier-footage review](VIDEO_REALISM_REFERENCE.md) identifies visible launch and landing details, how they can inform the game, and the recordings/audio that could not be reviewed. The landing clip supports continuous nose-high approach, ramp crossing, actual touchdown and short rollout staging. Sampled stills do not establish a numerical arresting-stop time.

The later 2.27-second night clip informs proposed navigation-light visibility, brief backlit tire smoke, warm deck illumination and a continuous tracking view. Those recommendations remain proposals; no new night-lighting implementation or full-stop timing measurement is claimed.

## Village-reference recommendations

The later nine supplied village photographs suggest three useful environment references: lowland riverbanks with sampans and landing paths; rural bamboo hamlets with courtyards, fences, baskets and pots; and raised upland houses with stairs, paths and rice/forest hills. These are **proposals**, not a claim that new village architecture has been implemented. Dates and exact locations were not established, so the photographs do not prove the appearance of a particular wartime village.

The strongest use is to build navigable houses, yards and banks with readable doorways, collision and consistent scale, supported by photographic material references. Distinct landing paths and village landmarks can improve river-exit choices and wayfinding. Raised houses should have physical stairs and usable space beneath them; baskets, fences and vegetation should help describe where a person can move rather than functioning as a flat backdrop.

## Verification and delivery limits

Domain tests, read-only alpha/source audits, isolated renderer fixtures, native browser gameplay and complete mission runs are different kinds of evidence. A test count must be tied to its actual scope and tested source hashes. Screenshots and GPU readbacks from Chromium/SwiftShader demonstrate that the production renderer ran; they do not demonstrate performance on physical Windows graphics hardware or an actual iPhone.

Actual iPhone Safari remains untested. No live Netlify deployment is performed by this integration. The combined runtime is packaged through an explicit allowlist that excludes original reference archives, source PNG plates, development tooling, Git data and test evidence. Earlier release ZIPs and private family/historical photographs remain unchanged. A large runtime ZIP is delivered through a new private runtime-only Git archive branch, with exact runtime contents and a source-parent relationship verified independently.

## Recorded validation

- **380 domain checks** in the final combined log, with zero failures.
- **33 wildlife checks**: Explicit source-coherent aggregate of preserved raw touch16 and desktop17 results, both layouts/all124 actual GPU poses. Raw paths/hashes/times and declared encounter/macro-camera fixtures remain identified; the failed initial desktop invocation is not represented as passing. Not natural-frequency or physical-device evidence.
- **28 landing-survival checks**: Desktop/touch native controls over declared tree, shore and river fixtures; original descent/cutaway/swim/reunion/pursuit physics plus24swim GPU poses/profile. Not a complete mission or physical-device FPS test.
- **14 carrier checks**: Native desktop/touch Mission01 entry and launch, declared moving-deck recovery/bolter fixture, all26 crew poses on actual GPU. No full mission or physical-device FPS claim.
- **2 aircraft-detail checks**: Native engine initialization then declared aircraft close-up cameras and native rotor routing/scene-alpha controls; two Chromium layouts, not an entire mission or universal photorealism.
- **31 human-motion checks**: Full six subjects/two land gaits/sixteen poses on desktop and phone layouts, with declared movement fixtures and source-bound actual GPU uploads; not filmed animation or physical-device FPS.
- **10 capture-transition checks**: Native surrender/pause/Continue and original ground capture/river transfer with declared fixtures; actual HTTP source and module hashes per layout.
- **43 mission-demonstrations checks**: All12 authoritative mission outcomes through original game update/physics/weapon/objective code, CPU fast-forward in Chromium, native demonstration controls and unchanged campaign storage. Not full-speed gameplay video or hardware FPS.
- **21 packaged checks**: Exact runtime HTTP/file hashes and native desktop/touch-layout packaged-game smoke, with declared production GPU upload checks. Byte-identical external copy of the original test-results/build.json.
- **2 realism-domain checks**: Source-stable CPU/domain and DOM fixtures across the final combined test programs, including ocean land-roster guards, single-store dispersion, carrier approach and prior photographic/ground/POW regressions. No GPU/device/FPS claim.

ZIP CRC and all 287 runtime hashes pass. 104 PNG/WebP source pairs retain identical decoded RGBA bytes, including hidden transparent RGB. Supplementary earlier-source regression logs remain separately scoped and are not included in the final source-bound browser counts.

Chromium uses SwiftShader WebGL2 with desktop and simulated iPhone landscape layouts. Physical Windows GPU performance and actual iPhone Safari remain untested. The full browser registry was not run.

## Download and deployment

For local play, serve the extracted game folder with `python3 -m http.server 8080`, then open `http://localhost:8080`.

[Complete game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/wildlife-jungle-site.zip) contains the exact runtime-only branch tree. GitHub generates its own outer folder and compression; the local ZIP checksum below does not describe GitHub's separately generated compression.

Local ZIP: **209,370,624 bytes**, SHA256 `1a1532b971d111e393b3205677e7c1c6d6456982713809f936e4a56a21f317a0`.

Extract the download, open its outer folder, and upload the game folder containing `index.html`, `assets/` and `_headers` to the existing Netlify site's Deploys page. Git build: branch `wildlife-jungle`, command `npm run build`, publish `dist/site`. This does not itself perform a live deployment.

[Reviewed renderer screenshots](../releases/wildlife-jungle-screenshots/) · [Complete test evidence](../releases/wildlife-jungle-tests.json).
