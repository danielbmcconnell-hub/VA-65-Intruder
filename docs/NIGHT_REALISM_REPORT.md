# Photographic clarity, motion and night realism

This is the working report for the `night-realism` candidate. Final source, runtime inventory, checks and the private download will be recorded here only after the tested candidate is packaged. The preceding [verified combined release](WILDLIFE_JUNGLE_AND_CARRIER_REPORT.md) remains available independently. No live Netlify deployment is part of this work.

## Changes under verification

The display finish removes artificial animated film noise and the strong global blue cast, reduces bloom and peripheral darkening, and retains the scene's own lighting. A separate subdued night cockpit palette keeps the instruments readable. The source photographs remain unchanged; this is a rendering change.

The threat presentation records actual SAM launches and derives crew clock bearings from the launch position and aircraft heading. It removes the fixed “four o'clock” call and the unearned claim that the aircraft is already turning down and right. Missile smoke and motor effects use bounded time/distance sampling and their own cosmetic random stream. Guidance, weapon damage and warning eligibility remain authoritative. Removing the former per-update cosmetic calls from the shared random stream can change later random draws, so previous sortie outcomes are not reused as final-source proof.

Aircraft work repairs opaque cap and shell faces that concealed the A-6's intake and cockpit interiors, the Sandy's engine aperture and the Jolly's glazing. Existing original coordinates and painted markings remain preserved while bounded interior details and smoother glazing are added. Running propeller/rotor presentation is being checked separately from the airframe. These remain rendered 3D models, not photographic aircraft cutouts.

Moving people retain a valid resident photograph from the same actor, subject and gait while another complete pose decodes. Bounded lookahead requests the next required plate earlier; action, identity, gait and stopping transitions still take priority. This does not add invented in-between poses or enlarge the existing texture budgets.

The jungle adds more varied whole-source plant placement and bounded low cover. A new opaque photographic forest-floor tile is restricted to the existing dry-jungle ground mode. It does not change terrain heights, river channels or wet ground into forest. Raw image-generator output and an exact lossless WebP derivative are retained; the source pixels are not repainted.

The later hand/pickup work is still under integration and requires its own combined native check. It adds separate complete photographic arm poses, an explicit free-hand Space punch alongside selected-weapon pointer/touch attack, and useful food, foliage, rifle, hat and stick pickups with bounded inventory and item effects. Generated arm sheets and the measured item atlas retain their source PNGs; the runtime uses exact WebP derivatives.

Space starts one free-hand punch per press. With both hands empty, accepted punches alternate right then left; a held pistol or knife leaves only the empty hand available, while the carried rifle occupies both hands. Each arm has eight complete authored poses with variable timing on a 1774-by-887 source sheet. The selected weapon uses left click or the touch Fire button. The rifle and branch use complete carrying photographs with a bounded recoil or swing transform; these are not separate photographic firing and striking sequences.

Approach and face an item, then press F or the contextual touch pickup button. Supplies opens the inventory, where the player can equip or stow the branch and rifle, remove worn camouflage or the hat, and return to fists. Supplies can be closed with its toggle, Close or Escape. F retains its existing draw/holster function when no eligible pickup takes the input.

Food supplies restore finite energy without removing wounds. Leafy camouflage slows movement while reducing the distant outline, and a conical hat has a smaller effect at distance; close or alerted observers remain a threat. A branch serves as a blunt weapon, while a rifle must come from an actually incapacitated or defeated armed NVA soldier. Carried rifle ammunition is capped at thirty rounds. Pickup reach and line of sight, swimming, pause, checkpoint ownership and prison confiscation remain authoritative.

The fictional Dirty Bird escape cell follows the supplied photographs with a narrow central aisle, twin raised concrete sleeping platforms, restraint props, recessed triangular vents and a steel door with a closed inspection flap and an open barred arched transom. Damp brown-gray photographic plaster and restrained overhead light replace the earlier flat appearance. The room remains three-dimensional and collision-backed, connects to the existing corridor and roof escape, and safely migrates incompatible older cell positions. This is a reference-based reconstruction rather than a surveyed historical cell; the separate three-by-nine-foot solitary-confinement regimen remains unchanged. The demonstration controller now uses the clear front apron instead of the concrete sleeping platform for its hiding approach; final native mission completion is still required.

Prison scenery and food presentation are being integrated in response to the later reference photographs. Material tiles, the food modal, whole-photo full/empty ration surfaces and capture/holding transitions require their own final native checks; their presence in source code alone is not a completed verification result. The complete meal photographs align with the ground and preserve their image aspect; they have limited depth and perspective, with the former mesh used only while the photographic textures load. The museum photograph labels its barbed wire as a replica, and the museum arrangement is not an exact wartime prison plan. The game's bamboo holding area and metal pit remain fictional constructions distinct from that museum reference. The meal photograph guides appearance without establishing a universal historical ration or portion.

## Verification requirements

The candidate is not accepted from unit tests or screenshots alone. Final evidence must include:

- All CPU programs against unchanged source and test hashes, with a complete zero-failure log.
- Every pre-existing registered browser suite, with exact suite inventory and actual HTTP/source bindings; declared fixtures and synthetic renderer probes retain their scopes.
- Both desktop and phone-layout production-renderer checks for threat warnings, delayed photographic pose loading, aircraft, jungle floor, display clarity, prison scenery/food and capture transitions.
- All twelve mission demonstrations reaching authoritative game success while preserving campaign storage.
- The exact runtime folder served independently, with every packaged file hash and native startup/control checks.
- Direct review of the selected actual-renderer images, including visible limitations.

Old fixture assumptions about removed low-resolution people atlases or vegetation that is intentionally deferred until ground entry are corrected in tests. Those fixture failures are not represented as product defects or silently relabeled as successful runs.

## Graphics and device limits

Complete photographic people and botanical objects still use billboards or terrain-aligned surfaces. Their finite authored poses cannot provide a correct photographic view from every camera angle. Aircraft remain 3D models; rotor motion blur is a visual treatment rather than an aerodynamic rotor simulation. Improvements must be assessed in actual views, without a claim of universal photorealism.

Chromium/SwiftShader and phone-layout emulation do not establish physical Windows GPU performance or actual iPhone Safari behavior. No hardware-FPS or real-device claim is made. English speech still depends on a recognized installed male American voice; unavailable matching voices retain captions rather than substituting a British or unknown voice.

## Preservation and delivery

The deployment allowlist includes runtime scripts, manifests and exact runtime images. It excludes original reference archives, generated source PNGs, development tools, test evidence and Git history. Earlier published branches/tags, all earlier release ZIPs and pre-existing bitmap/reference originals remain protected by the delivery baseline.

A completed delivery will use a new private `night-realism-site` runtime-only branch whose sole parent is the tested source commit. After publication, a separate checkout must materialize every runtime file and compare its actual SHA256 and bytes with the tested local ZIP. GitHub's independently generated outer ZIP compression is not described by the local ZIP checksum.

For local play after delivery, serve the extracted game folder with `python3 -m http.server 8080` and open `http://localhost:8080`.
