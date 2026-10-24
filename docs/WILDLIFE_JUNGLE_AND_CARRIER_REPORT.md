# Wildlife, jungle, carrier and survival integration

This is the working integration report. Final release evidence, exact source commit, runtime-file inventory and the private download are recorded in `releases/wildlife-jungle-tests.json` and `releases/wildlife-jungle-build-manifest.json` when the tested candidate is packaged. Their absence means that a combined release has not yet been verified. The previous photographic-motion release remains available separately.

## Graphics and movement

The existing six subjects retain their complete standing/aiming/fallen photographs and 192 walking/running poses. Movement follows actual travel distance, so collision, pause and stopping do not continue a stationary walking cycle. NVA, militia/VC and the aviator each add eight complete horizontal swimming poses: 24 photographs across six plates. A separate full-body aviator photograph depicts suspension in a parachute harness. Swimming and suspension are registered separately from walking poses and use the same bounded texture cache. The original 192 land-movement registrations remain unchanged.

Wildlife adds eight types: wild boar, tiger, krait, cobra, pit viper, scorpion, centipede and weaver ants. The authored collection contains 124 movement/threat poses in 31 plates, plus a separate woven-leaf nest photograph. Boar and tiger have separate sixteen-pose walk and run clips; smaller creatures have eight crawling poses, and the three snakes also have four threat poses. Generated source PNGs remain unchanged. Exact lossless WebP encoding preserves every decoded RGBA byte, including hidden RGB beneath transparent pixels. Source-bound whole-figure registration keeps each photograph intact and prevents neighboring figures entering a pose. Explicit tiger camera-scale registration corrects documented source-camera variation without changing image pixels.

Six botanical photographs provide canopy, bamboo, nipa, ferns, lianas and leaf litter. Layered placement, nearby shaded forest soil and horizontal litter surfaces improve the forest floor. Ground paint and vegetation use the same dry-jungle habitat, excluding river channels and flood banks. This avoids treating a wet river channel as a painted forest floor. Visible solid trunk cores participate in collision; placement and queries are bounded. Existing terrain heights and original private/reference photographs are preserved. The latest habitat/floor adjustment awaits its final full browser evidence.

The deck-crew collection contains six complete high-resolution role photographs and twenty additional signal/inspection/walking poses. Carrier aircraft, crew, steam and the deck share the ship's moving frame. Aircraft-specific local materials and corrected smooth normals improve the existing A-6A, A-1 and HH-3 geometry without replacing their markings or flight physics.

The landing candidate uses deck-relative contact and a lowered hook's swept crossing of an arresting wire. A successful crossing starts a bounded cable-arrestment rollout rather than immediately setting aircraft velocity to zero; a missed wire retains forward motion for a bolter. Touchdown smoke, sound and camera feedback follow actual landing events. The carrier geometry work also addresses a hull crown that could protrude through the flight deck: a solid deck requires correct opaque geometry as well as an alpha value. These landing and hull changes remain subject to the final native launch/recovery and actual renderer checks; the working report does not substitute for their recorded results.

The approach guidance follows a gravity-stabilized glidepath anchored to the carrier's moving aim point. It uses the preceding completed ship-motion interval for aim-point velocity, rather than extending a pitching deck plane far behind the ship. Optical guidance and LSO feedback share that reference. This addresses incorrect guidance during pitching-deck approaches; physical ramp, hook, wheel and cable contact still determine whether the aircraft lands safely. Final source-bound sortie and storm-fixture evidence must be consulted for its verified range of conditions.

People, larger wildlife and crew still use photographic billboards rather than fully articulated 3D models. Small wildlife and litter use terrain-aligned surfaces. These are generated photographic pose reconstructions guided by supplied references, not filmed animation sequences; they do not guarantee a correct photographic view from every possible camera angle. The existing Sandy/Jolly rotor blur uses static blade/disc geometry with native transparency; it is not a new physically animated rotor system. Their existing opaque glazing remains a visual limitation.

## Survival and controls

The wildlife simulation uses habitat-aware seeded encounters, visible warnings and bounded temporary injuries. It distinguishes a boar charge, rare tiger stalking, defensive small-animal contact and a localized ant nest. Existing weapons use actual targeting, line-of-sight and ammunition; animals do not become invisible human patrol actors. The simulation stops under menus, pause, capture and incompatible prison stages.

Tree landings can catch a parachute on actual nearby canopy geometry. The suspended aviator receives a cutaway control; releasing the harness resumes a gravity-driven drop with bounded branch/fall injury. Ocean movement uses immersion, a lower wave-following camera and movement-driven splashes. River movement supports physical bank exits and a limited number of warned NVA/VC pursuers entering the water.

Ordinary land patrols check terrain before spawning or walking, and an ocean landing skips terrestrial farmer/militia first contact. A rescue-smoke signal at sea remains at the water surface and does not create walking ground reinforcements or an unsupported ground-threat warning. The river's deliberate pursuit/entry mechanics remain a separate water-capable path. The ocean-roster CPU fixtures verify the actual spawning, movement and smoke methods; focused ocean browser evidence is supplementary until the complete two-profile survival report also passes.

Both surviving aviators eject with separate physical descent paths. A reunion depends on proximity and visibility, followed by Follow/Wait controls, collision-aware movement and patrol warnings. Rescue of the second aviator requires reaching the cable and boarding, rather than assuming a distant companion is also rescued. The historical mission's separation remains distinct from this optional teamwork.

The controls legend accepts pointer/touch input, has an explicit close control and can be toggled again. New demonstration, companion and cutaway guidance must likewise remain dismissible without hiding the required flight or survival controls.

## Voices and demonstrations

English speech selects an explicitly recognized male United States voice available in the browser. British, unknown and female default voices are not substituted. If a matching voice is unavailable, captions and the existing radio sound remain usable. Vietnamese speech stays Vietnamese. Calm, alert and urgent delivery adjust the available voice's timing and emphasis; this does not add recorded voice actors or guarantee that every device has suitable installed voices.

The demonstration director exposes all twelve missions and explains controls and objectives while using the game's normal flight, targeting, stores, collision and mission-result paths. Controller/domain tests alone do not prove successful completion of every mission. The final evidence must state which demonstrations actually reached their authoritative success result, and must distinguish those runs from test fixtures.

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
