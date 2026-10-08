# Deploy the Milestone 2 playable build

1. Sign in to your private GitHub repository. Open `releases/Intruder_Yankee_Station_Milestone2.zip` and choose **Download raw file** (the down-arrow button), or use its direct download link in `releases/README.md`.
2. On Windows, right-click the saved ZIP and choose **Extract All**. The extracted folder must contain `index.html`, `assets/` and `_headers` at its root.
3. Upload that extracted folder through Netlify's manual deploy/drop interface. Do not upload the whole source checkout or the evidence ZIP.
4. Open Netlify's HTTPS URL in Windows Chrome and directly in iPhone Safari. Use landscape orientation and start with Low/Medium graphics. Opening an HTML file inside Files or a chat preview does not run the hosted browser game.
5. Choose **Enter Ready Room → Enter the prison**. Mission 11's capture also enters the physical prison chapter. Capture on ordinary missions enters interactive solitary confinement. The existing flight missions remain below the new card.
6. Use **Save** during play. **Continue POW checkpoint** in the Ready Room, or **Continue** in the chapter, resumes progress stored in that browser on that exact site origin. Progress is not automatically shared between your PC and phone, and clearing site storage removes it.
7. Read the play guide for movement, mouse/touch look, timed interactions, river controls and captivity puzzles. In the chapter's settings, choose Normal/Hard and Standard/Reduced presentation.

The runtime is entirely static: no API key, game backend or npm installation is needed on Netlify. For Git-connected deployment, use `npm run build` and publish directory `dist/site`. The source repository stays private. Deploying the complete source checkout would expose archival/reference materials; the runtime allowlist excludes those materials, Git, tests, developer tools and screenshots. The runtime still contains the family photographs displayed in the game, as well as the six supplied historical WebPs; choose your site access according to your sharing preferences.

The previous Milestone 1 ZIP and history remain available separately. Use a separate Netlify site or retain the previous deploy when comparing versions. This task produces a tested deployment ZIP; it does not change your live Netlify site.

## Device trial

Cloud verification uses actual Chromium WebGL2 and touch emulation. It does not verify physical iPhone Safari or Windows GPU performance. On your devices, check sustained play, landscape/rotation/safe areas, audio and available Vietnamese voices, pointer lock, tap timing, river concealment, save/reload, app suspension and graphics recovery. Patrol difficulty and the photographic atlases' limited true gait poses still need human assessment.
