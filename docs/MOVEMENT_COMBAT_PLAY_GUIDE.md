# Movement & Combat Polish — download and play

[Download the complete game ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/movement-combat-polish/releases/Intruder_Yankee_Station_Movement_Combat_Polish.zip) from the private `movement-combat-polish` branch. Sign into GitHub first. If GitHub opens the file page, choose **Download raw file**. Archive identity and completed verification are recorded in the [test report](MOVEMENT_COMBAT_REPORT.md).

## Update your Netlify game from Windows

1. Save `Intruder_Yankee_Station_Movement_Combat_Polish.zip`, then right-click it in File Explorer and choose **Extract All**.
2. Open the extracted folder. Its immediate contents should include `index.html`, `assets/` and `_headers`.
3. Open your existing **steady-croquembouche-46c1a0** project in Netlify and select **Deploys**. Upload that extracted runtime folder through the manual deployment area.
4. After publication, open [your existing game address](https://steady-croquembouche-46c1a0.netlify.app/). Refresh it and confirm the browser tab title says **Intruder: Yankee Station — Movement & Combat Polish**. On Windows, **Ctrl+F5** can refresh an older cached page.

This delivery has **not redeployed the live Netlify site**. The new version appears there after you upload and publish it. Keep the same website origin to retain existing saves; saves remain local to that browser and device. A different domain, browser or phone does not share them. Avoid clearing site data when refreshing an update.

Upload the runtime folder directly, without an extra enclosing source folder. Double-clicking the extracted HTML is not the supported launch method: use Netlify or a local HTTP server. A Git-connected Netlify deployment can use branch `movement-combat-polish`, build command `npm run build` and publish directory `dist/site`.

## Countryside survival controls

These controls apply after the crew reaches the ground outside the POW chapters.

| Action | Keyboard and mouse | Touchscreen |
| --- | --- | --- |
| Move forward/backward | W/S or Up/Down arrows | Left stick |
| Turn | A/D or Left/Right arrows | Left stick sideways |
| Look around | Y / **Mouse look**, then move the captured mouse | Drag an unobstructed area on the right side |
| Look up/down | Q/E | Right-side drag |
| Run | Hold Shift | **Run** |
| Crouch | Hold C | **Crouch** |
| Draw/holster the revolver | F | **Pistol** |
| Select knife/fitting, when carried | V | **Knife** |
| Select fists | P | **Fists** |
| Fire or strike with selected equipment | Space | **Fire** |
| Survival radio | R | **Radio** |
| Deploy smoke, when available | G | **Smoke** |
| Pause | Upper-left pause button / Escape | Upper-left pause button |

Use landscape orientation on iPhone. The right-side look gesture retains its aim when the finger lifts. Pausing cancels a held gesture; lift your finger and begin a fresh drag after resuming.

Browser tests verified right-drag aiming, retained pitch, original left-stick movement, cancellation on pause/capture loss, native Fire taps and separate prison touch controls in simulated iPhone landscape. Actual iPhone Safari hardware remains untested.

Aim using the centre crosshair. A nearby person must also be in the actual direction you are looking; looking above or below a person should miss. Hit tests approximate a solid body rather than inspecting individual photographic pixels, so very fine silhouette edges may differ. Solid cover, weapon reach, ammunition and the original damage rules still matter. The on-foot revolver is separate from the aircraft's weapons.

Equipment movement now follows actual travel. Running and crouching have different cadence and intensity; pushing against a wall no longer produces a walking cycle. Accepted shots and strikes produce their own brief motion. Pausing freezes the presentation. A system **Reduce motion** preference suppresses breathing and gait movement. These changes retain the existing artwork; they do not add a filmed hand animation or change weapon damage.

## POW chapters and flight

Choose **Enter Ready Room → Enter the prison** for the existing physical cell-to-river escape. The POW chapters keep their own interaction hands and control meanings: **F / Interact** works on a nearby object; **Space / Climb or Dive** performs the contextual action. Prisoners do not gain a firearm through the countryside weapon controls. Use the chapter's visible prompts, saved checkpoints and controls tutorial.

The existing A-6A flight simulation, missions, photographs and historical qualifications remain. See the [guided strike play guide](DIXIE_STRIKE_PLAY_GUIDE.md) for B/N gameplay and the [physical escape guide](MILESTONE2_3_PLAY_GUIDE.md) for the longer prison route.

## Device limits

The source photographs and stylized equipment illustrations retain their existing detail and perspective limits. Unlit characters remain dark at night. Cloud Chromium WebGL tests and simulated phone layouts do not establish physical Windows/iPhone Safari performance or a sustained frame rate. Rotation, backgrounding, audio, comfort and device performance still need your trial. See the [test report](MOVEMENT_COMBAT_REPORT.md) for the exact completed checks and remaining limitations.
