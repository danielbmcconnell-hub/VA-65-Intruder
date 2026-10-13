# Milestone 2.2 · update your existing Netlify game

These instructions update **steady-croquembouche-46c1a0** while retaining its existing address. They do not indicate that an upload or deployment has already occurred.

1. Sign into the private GitHub repository and open [Intruder_Yankee_Station_Milestone2_2.zip](../releases/Intruder_Yankee_Station_Milestone2_2.zip) in the delivered Milestone 2.2 branch. Choose **Download raw file** to save the ZIP on your Windows PC.
2. Right-click the ZIP and choose **Extract All**. Open the extracted folder. Its root must contain **`index.html`**, **`assets/`** and **`_headers`**.
3. Sign into Netlify and open the existing **steady-croquembouche-46c1a0** project/site. Go to **Deploys** and use its manual upload area to upload the extracted folder containing those three items. Upload the runtime folder, rather than the source repository or test-evidence ZIP. Keep the existing project and domain.
4. Wait for Netlify to mark the production deploy as published. Open [the existing game address](https://steady-croquembouche-46c1a0.netlify.app/) in Windows Chrome and directly in iPhone Safari. The browser title should read **Intruder: Yankee Station — Milestone 2.2**. In **Ready Room**, confirm **Enter the prison**, **Solitary survival**, **Second escape** and **Red River journey**. Operations also offers **Carrier practice with guidance** and **DIANE practice with guidance**.
5. If the previous version appears, refresh the page. On Windows, use **Ctrl+F5**. On iPhone, reload or reopen the same address; you can append `?v=milestone2-2` to request a fresh entry page. That query keeps the same save origin. Do not clear site data while preserving progress.

The older latest campaign checkpoint is automatically archived into its named campaign slot before a practice chapter replaces the shared latest-save entry. You can start practice without first resuming and saving the campaign. **Saved chapters → Resume October escape** returns to the saved campaign; practice chapters have their own named slots. The generic **Continue POW checkpoint** resumes the latest unfinished save, which may be practice. **Enter the prison** starts a new campaign; use Resume to keep existing progress.

Saves live in the browser on the exact HTTPS origin. Retaining this domain preserves that storage; a new site, different browser/device, private browsing or cleared site data does not share those saves. Deployment itself does not erase browser storage. Practice starts teach a chapter without granting campaign qualifications.

Use the [Milestone 2.2 play guide](MILESTONE_2_2_PLAY_GUIDE.md). On iPhone, start in landscape with Medium graphics, or Low if needed. Check movement/look, held Interact and release, sound, photographs, chapter resume and rotation on your own devices. Cloud Chromium and touch emulation do not establish physical Windows or Safari performance. Previous production deployments remain available in Netlify's Deploys history for rollback.

The build is static and needs no API key, backend or local installation. It contains the photographs displayed in the game; the runtime ZIP excludes reference archives, development dependencies, Git history and test evidence.
