# Test the Milestone 1 build

1. Download and extract `Intruder_Yankee_Station_Milestone1.zip`.
2. Upload the extracted folder to Netlify's manual deploy/drop interface. `index.html`, `assets/` and `_headers` must be at the uploaded folder's root.
3. Open Netlify's HTTPS site URL in Chrome/Edge on Windows and directly in Safari on your iPhone. An HTML preview inside Files or ChatGPT is not the browser game. Start in landscape; tap Ready Room or Fly Training Mission to activate sound.
4. Start with Low or Medium graphics. Use Settings → Unlock all missions if you want to inspect every mission immediately. Progress, grades and Cruise Log are stored in that browser on that site origin.
5. Test Mission 11's capture/escape route and the rescue debrief portrait, then check Cruise Log. On desktop press H for controls. iPhone uses the stick/action buttons; eject requires two taps. After a graphics interruption, wait for the recovery message and choose Resume.

The ZIP is a static browser build; no npm install, server, API key or backend is required by Netlify. Do not upload the entire source checkout: it includes private reference photographs, the original archive, Git history and developer evidence. Only `dist/site` or the runtime ZIP is intended for deployment. The runtime includes the family photographs displayed by the game; control access to the Netlify site according to your sharing preferences.

For a Git-connected deployment **after you choose to publish the source**, use build command `npm run build` and publish directory `dist/site`. Keep the repository private. No deployment or Git push was performed in this milestone.

For local development, install Node 20+ and run `npm ci`, then `npm run dev`; open the local server in a normal WebGL2 browser. `npm test` needs Chromium (the cloud runner uses `/usr/bin/chromium`; elsewhere run `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a compatible browser path). Asset verification also needs Python 3.11+ and `python3 -m pip install -r requirements-dev.txt`. Test evidence is separate from the deployment folder.
