# Clear cockpit, branched jungle and parachute threats

[Download the private complete game](https://github.com/danielbmcconnell-hub/VA-65-Intruder/archive/refs/heads/cockpit-focus-site.zip) (GitHub sign-in required).

Your original jungle photographs guide the new broadleaf sprigs and coconut fronds. Their source paths and hashes are recorded in [component provenance](../assets/jungle/components-provenance.json). The original photographs remain unchanged. The new transparent components are generated artwork, with complete PNG sources and lossless WebP runtime derivatives preserved.

Nearby hardwoods now have asymmetric forks, visible branches and layered leaves at fixed world orientations. Palms have curved trunks and drooping radial fronds; bamboo uses multiple culms and pointed leaves. Loading and failed-photo fallback trees also use branches and individual leaves. Carrier and recovery scenery now use the same botanical rendering path. Distant trees still use bounded photographic detail levels; terrain and some authored scenery remain procedural.

In flight, **COCKPIT** opens the utility controls. **Guidance** keeps its saved preference; **Guide details** opens the longer explanation when needed. Menus and guides close through their toggle or Escape. The normal pilot view keeps its forward area clear. B/N panels fit between navigation, armament and the radar disk. Critical damage and threat warnings retain their instructions. Mission demonstrations keep a short **WIN**, actual progress and **Next** action beside **Pause**, **Take** and **Stop**; **GUIDE** opens the route explanation.

Mission cues now distinguish reconnaissance from attacks, required targets from bonus targets, an achieved objective from an empty weapon rack, and remaining anti-radiation missiles from expended bombs. Recovery is still required where the original mission rules require it. Routine crew feedback is brief and yields to incoming radio and critical damage calls.

During parachute descent, nearby armed positions can acquire and fire on either aviator after the canopy opens. Photographic gunmen, muzzle flashes, tracers and short warnings reveal the threat. Range, facing, terrain and buildings govern shots; steering away and landing behind cover can break contact. Injuries carry into the ground phase, and surviving gunmen become normal nearby enemies. This adds risk without guaranteeing a hit on every descent.

Verification results and the exact runtime manifest will accompany this release. Chromium phone-layout checks use the actual WebGL2 renderer but do not establish physical iPhone Safari performance. The update improves branch shapes, materials and screen layout; it does not make every scene a photograph or establish movie-quality frame rates on every device.

Extract the complete game, serve the folder containing `index.html` and `assets/` with `python3 -m http.server 8080`, and open `http://localhost:8080`. The earlier [jungle training release](jungle-training-notes.md) remains available.
