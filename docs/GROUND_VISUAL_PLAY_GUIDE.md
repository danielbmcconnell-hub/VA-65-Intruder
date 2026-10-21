# Ground & Visual Refinement — download and play

The complete game ZIP is intended for `releases/Intruder_Yankee_Station_Ground_Visual_Refinement.zip` on the `ground-visual-refinement` branch of the private [VA-65-Intruder repository](https://github.com/danielbmcconnell-hub/VA-65-Intruder/tree/ground-visual-refinement). Sign in to GitHub with access to that repository, open **releases**, select the ZIP and choose **Download raw file**. Downloading the repository's **Code → Download ZIP** instead gives the source checkout, rather than this ready-to-deploy archive.

The ZIP contains the complete existing game. This delivery does not redeploy your Netlify site. Your current [game address](https://steady-croquembouche-46c1a0.netlify.app/) will show the new version only after you upload the build there.

## Update your existing Netlify site from Windows

1. Save `Intruder_Yankee_Station_Ground_Visual_Refinement.zip` and choose **Extract All** in Windows File Explorer.
2. Open the extracted folder. Its immediate contents must include `index.html`, `assets/` and `_headers`.
3. Open the existing **steady-croquembouche-46c1a0** project in Netlify, then **Deploys**. Use its manual deployment upload area and drop that extracted site folder there. Upload the folder containing `index.html` directly, rather than a source checkout or an extra enclosing folder.
4. Wait for the deployment to publish, then open your usual game address. Refresh the page; on Windows use **Ctrl+F5** if an old page remains.
5. Confirm the browser tab title says **Intruder: Yankee Station — Ground & Visual Refinement**. If it still identifies an older build, check which Netlify deployment is published.

Keep the same Netlify website origin to retain local saves. Saves belong to that exact website, browser and device: a different domain, a deploy-preview address or another device does not share them. Do not clear site data when checking an updated build. The game needs an HTTP/HTTPS server; double-clicking the extracted HTML is not the supported way to play. A source checkout can also run through `npm ci`, `npm run dev` and the localhost URL printed by the server.

## Start playing

Choose **Enter Ready Room**. In **Operations**, **Enter the prison** starts the existing physical cell-to-river escape. Use **Continue POW checkpoint** or an appropriate saved chapter to resume a previous run. Starting a new prison chapter is different from continuing a save.

The existing **Solitary survival**, **Second escape**, **Red River journey**, guided B/N strike and ordinary flight missions remain available. Standalone practice chapters keep their separate checkpoints. For the longer escape route, see the [Milestone 2.3 play guide](MILESTONE2_3_PLAY_GUIDE.md); for the guided strike, see the [Dixie strike guide](DIXIE_STRIKE_PLAY_GUIDE.md).

## On-foot controls

| Action | Desktop | Touchscreen |
| --- | --- | --- |
| Walk forward/back | W/S or Up/Down arrows | Left stick |
| Turn | A/D; Left/Right arrows in the POW chapter | Move the left stick sideways |
| Look around | Y or **Mouse look** captures the mouse; move it to look; Escape releases it | In POW chapters, drag an unobstructed area on the right side |
| Look up/down | Q/E | Right-side drag in POW chapters |
| Run | Hold Shift | **Run** |
| Crouch | Hold C | **Crouch** |
| Work on a POW object | Face it within reach and hold F; release between actions | Hold **Interact**; release between actions |
| Climb or dive in POW chapters | Space at the relevant place; hold while diving | **Climb** / **Dive** |
| Throw a collected stone in POW chapters | R | **Throw stone** |
| Pause | Escape or the upper-left pause button | Upper-left **\| \|** button |

In the POW chapter, A/D strafes while mouse look is captured; arrow keys still turn. Mouse look on foot uses the existing ground view and does not fly the aircraft. Crouching changes the physical posture immediately while the camera eases to its new height. Walls and locked doors still block movement.

The countryside survival controls retain their separate meanings: **F / Pistol** selects the revolver, **Space / Fire** fires, **V / Knife** selects the knife, **R / Radio** calls survival radio and **G / Smoke** deploys smoke. Prisoners do not acquire a firearm through these controls. In the aircraft, Y retains **Mouse fly**, and the existing flight controls and Keys card apply.

On iPhone, use landscape orientation and the visible controls. Begin at a graphics setting your phone handles smoothly and lower it in Ready Room **Settings → Graphics** if needed. Pausing cancels a held POW look gesture; lift your finger and begin a fresh drag after resuming. The **Save** and **Continue** buttons in the POW interface store and restore checkpoints on that browser/device.

## Verification limits

The ground-view checks passed in actual Chromium WebGL2: native desktop pointer lock and keyboard input, simulated iPhone layout with native CDP touch events, original prison-wall collision, and original ejection/parachute descent into countryside survival. Camera-rate, pause and saved-state checks also run against the production ground-view module. These are cloud-browser tests, not physical Windows or iPhone Safari testing. Actual device performance, backgrounding, rotation, audio and comfort still require your trial.
