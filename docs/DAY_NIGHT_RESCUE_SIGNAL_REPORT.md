# Day/night rescue signal

Press **G** or tap **Smoke** when the rescue panel says to signal. Your supplied signal photograph appears in the left hand: **orange smoke in daylight**, **red signal flame at night**. Day/night is selected from the real atmosphere at activation. The hand stays raised for eight simulation seconds, then lowers while the deployed world beacon continues guiding the helicopter. Orange world smoke replaces the old green plume. At night a compact red additive flare, vertical flame core and small warm center replace the smoke cloud; a little grey haze remains.

The signal owns the left hand during activation, hiding the left fist/radio without changing selected right-hand equipment. Pause freezes the pose. It stays hidden before actual rescue readiness, without an accepted signal, in menus/captivity or during surrender/capture. Radio, ammunition, rescue eligibility, pickup position, enemy response and the existing flight/mission systems remain. The accepted signal still attracts the original searchers.

The supplied JPEG is preserved byte-for-byte at `reference_media/firstperson/smoke-original.jpg`. Transparent day/night derivatives use the supplied hand, sleeve and canister; the night edit replaces the orange plume with a red flame. Derivatives are prepared with the image-editing tool and are not claimed pixel-identical. Historical/family photographs and the earlier fists, revolver, knife and radio assets are untouched.

Source commit `fc082e6084be9e224264588c7f806debcd4e8be1`, branch `day-night-rescue-signal`; baseline tag `day-night-rescue-signal-start`. Changed runtime files: `index.html` (held signal, activation timestamp/mode, orange/red world effects and matching crew callouts), two `assets/firstperson/smoke-*.png` images, and POW `core.css` (hide outside the appropriate chapter). Packaging includes the two images; `npm run test:signal` runs the new browser suite. No new dependency, renderer or flight engine.

## Tests actually performed

- **32 domain checks**: existing equipment animation/timing and ammunition accounting.
- **22 actual-browser signal checks**, desktop 1280x720 and simulated iPhone landscape 844x390/DPR3: native G/Smoke input, no premature activation, real three-call radio authentication and original rescue-clock advance to readiness, correct photo alpha/day/night choice, actual orange world smoke, red glow plus vertical flame particles, retained right-hand revolver/ammunition, left-hand ownership, pause, expiry, unchanged placed beacon, menus/capture/surrender boundary fixtures and genuine POW chapter entry. Eight actual WebGL screenshots show both held signals and deployed beacons after real backward movement. The original signal-spawned enemy response is observed before isolating later presentation checks.
- **14 radio browser regression checks** across the same layouts: actual keyboard/native touch calls, original queues/cooldown, left-hand art, retained revolver/ammunition, pause/expiry, fresh actors and actual captivity entry.
- **17 packaged-build checks**: all 160 runtime files served with matching hashes; desktop/touch-layout flight and B/N controls, POW checkpoint/history photos, Willard interceptor and Dixie practice. ZIP CRC and every runtime hash pass. All other previous runtime files outside `index.html` and POW `core.css` match the preceding delivery byte-for-byte; all 31 older ZIPs remain unchanged.
- Preservation checks protect original photographs, historical mission definitions, complete original A-6A physics/geometry/markings, original atlases and JavaScript syntax.

Actual WebGL rendering uses Chromium/SwiftShader. Dry-ground entry, atmosphere, isolated encounters and declared boundary fields are fixtures; accepted signal timestamps, placed signals and success flags are never forged. This is not a new claim of every complete mission or hardware performance. The full browser registry, physical Windows and actual iPhone Safari were not tested. The held photographic plume is one edited pose with a small arm motion; world particles animate independently.

## Download and deploy

[Complete game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/day-night-rescue-signal/releases/Intruder_Yankee_Station_Day_Night_Rescue_Signal.zip) (sign into GitHub). **41,897,766 bytes**, **160 files**. SHA256 `4a48cd33e00928e1c50e42ec3cb75726d989e5828ff398a703f19acf941b468e`. Contains all prior missions, equipment and radio art; excludes reference originals, archives, dependencies and tests.

On Windows **Extract All**, then upload the extracted folder containing `index.html`, `assets/` and `_headers` through the existing Netlify project's **Deploys** page. Tab title ends **Rescue Signal**. Git-connected deployment: branch `day-night-rescue-signal`, build `npm run build`, publish `dist/site`. Keep the same site origin for existing local saves. The live Netlify site has not been updated by this file/Git delivery.

[Screenshots](../releases/day-night-signal-screenshots/) · [Actual test results](../releases/day-night-signal-tests.json) · [Runtime hashes](../releases/day-night-signal-build-manifest.json).
