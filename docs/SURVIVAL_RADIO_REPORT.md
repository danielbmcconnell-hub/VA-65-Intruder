# Survival radio photograph

Your supplied radio photograph appears in the left hand for 2.8 simulation seconds after an accepted survival transmission. Press **R** on desktop or tap **Radio** on iPhone. Calls queued during the existing cooldown display the radio only when accepted; repeated calls extend its display. Pause freezes the pose. The left fist is hidden during transmission; the selected right-hand revolver/knife remains visible. The photo disappears when transmission ends and stays hidden without a radio, in captivity, during surrender/capture, or outside gameplay.

The white background is removed with true alpha transparency. The original supplied JPEG is preserved byte-for-byte at `reference_media/firstperson/radio-original.jpg`; the transparent runtime derivative is prepared with the image-editing tool and is not claimed pixel-identical. The photograph is not mirrored. Rescue progress, radio cooldown/queues, ammunition, weapon selection, flight physics and historical mission content are unchanged.

Source commit `1bd3e76580e77ef8fa90ae13da955d5be6411325` on branch `survival-radio-photo`; baseline tag `survival-radio-photo-start`. Changed runtime: `index.html` (left-hand layer/styles, read-only accepted-transmission presentation, title), `assets/firstperson/radio.png`, and `assets/pow/core.css` (hide during POW chapters). Packaging adds the PNG; `npm run test:radio` runs the new browser tests. Original photograph/provenance, reports and screenshots are outside the Netlify runtime.

## Actual verification

- **32 domain tests**: existing equipment animation/timing and ammunition accounting.
- **14 actual-browser radio checks**: genuine keyboard and native touch radio input; accepted call timing, queued cooldown, real image alpha/solid interior and left-hand framing, retained right-hand revolver with unchanged ammunition, pause, expiry, fresh actors, Ready Room, surrender/unavailable-radio/capture boundary fixtures and actual POW chapter entry. Four actual WebGL2 screenshots: desktop and phone-layout fists/radio and revolver/radio. No missing local files, JavaScript or WebGL errors.
- **21 equipment browser regression checks**: photographic fists/revolver/knife, original ground movement/run/crouch, wall blockage, recoil and spent rounds, pause, reduced motion, native touch stick and genuine unfinished bunk work using POW interaction hands.
- **17 packaged-build checks**: all 158 exact runtime hashes served over HTTP; desktop/touch-layout flight/B/N controls, prison checkpoint/photos, Willard interceptor and Dixie practice. ZIP CRC and every runtime hash verified. Every other previous runtime file outside `index.html` and POW `core.css` matches the preceding release byte-for-byte. All 30 earlier release archives preserved.
- Preservation checks: original family/historical photo hashes, mission definitions, complete original A-6A physics/geometry/markings, original atlases and JavaScript syntax.

Browser runs use actual Chromium/SwiftShader WebGL2 at 1280x720 and simulated iPhone landscape 844x390/DPR3. The radio/equipment tests explicitly initialize dry ground and isolate encounters; boundary flags are declared fixtures, not claims of complete capture/ejection playthroughs. The full browser registry and every mission completion were not rerun for this focused presentation change. Physical Windows, actual iPhone Safari and hardware FPS remain untested.

## Download and deploy

[Complete game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/survival-radio-photo/releases/Intruder_Yankee_Station_Survival_Radio.zip) — sign into GitHub. Includes all existing missions and equipment. **38,444,518 bytes**, **158 files**, SHA256 `ef4a8ae79b054805ad24a132715a4ba98ac40f283c88d6bc379cd02713d00810`.

On Windows **Extract All**, then upload the extracted folder containing `index.html`, `assets/` and `_headers` through the existing Netlify project's **Deploys** page. Tab title ends **Photographic Equipment & Radio**. For Git-connected deploys use branch `survival-radio-photo`, build `npm run build`, publish `dist/site`. Keep the same site origin to retain existing local saves. The live Netlify site has not been updated by this Git/file delivery.

[Screenshots](../releases/survival-radio-screenshots/) · [Actual test results](../releases/survival-radio-tests.json) · [Runtime hashes](../releases/survival-radio-build-manifest.json).
