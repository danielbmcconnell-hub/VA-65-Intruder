# Milestone 2.1 — playable game downloads

This build adds explorable 3D memory projects, progressive counted POW communication, Denton and Stockdale photographs, an optional Morse lesson and a guarded subsequent escape from regular imprisonment. It preserves the custom WebGL engine, A-6A flight simulation, eleven missions and original tribute photographs.

- [Download the Milestone 2.1 playable Netlify ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/milestone2-1/releases/Intruder_Yankee_Station_Milestone2_1.zip) — 23.3 MB.
- [Download screenshots and test evidence](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/milestone2-1/releases/Intruder_Yankee_Station_Milestone2_1_Evidence.zip) — 54.9 MB, 51 actual browser screenshots.
- [Browse eight sample screenshots](milestone2_1-screenshots/).
- [Test report](../docs/MILESTONE_2_1_TEST_REPORT.md), [play guide](../docs/MILESTONE_2_1_PLAY_GUIDE.md) and [Netlify instructions](../docs/NETLIFY_DEPLOYMENT_MILESTONE_2_1.md).
- [Historical source audit](../docs/MILESTONE_2_1_HISTORICAL_SOURCES.md).

231 source browser checks, 133 Node/VM checks and five packaged-build checks passed. Actual Chromium WebGL2 and emulated phone controls were exercised. Physical Windows/iPhone Safari, hardware performance and human balance remain for your trial. The report identifies all fixtures and historical verification limits.

Sign into this private repository, save the playable ZIP, choose **Extract All** on Windows and upload its extracted contents to Netlify. The folder root must contain `index.html`, `assets/` and `_headers`. Git-connected deployment uses branch `milestone2-1`, build command `npm run build`, publish directory `dist/site`. Choose **Ready Room → Enter the prison**. The live Netlify site was not changed by this delivery.

Tested source: `83c6eb973cdbac19b077403f7532761e02695d97`. ZIP SHA-256: `801e271ff0d0453bd81315d2491a7a6c93be1bb72bae576745cff864076198c8`. `milestone2_1-build-manifest.json` records all 54 runtime hashes; `milestone2_1-summary.json` records counts and limits. Full Git ancestry and all older release files remain intact. The new branch does not overwrite Milestone 1 `main`/`work` or `milestone2`.

## Preserved Milestone 2 delivery


This test build adds physical prison escape, guard perception and pursuit, a playable river journey and fictional rescue, interactive captivity projects and counted tap-code communication. The custom WebGL engine, A-6A flight physics, all eleven mission definitions and original photographs are preserved.

- [Download the Milestone 2 playable Netlify ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/milestone2/releases/Intruder_Yankee_Station_Milestone2.zip) — 22.3 MB.
- [Download screenshots and test evidence](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/milestone2/releases/Intruder_Yankee_Station_Milestone2_Evidence.zip) — 79.5 MB, including 84 actual browser screenshots.
- [Test report](../docs/MILESTONE_2_TEST_REPORT.md).
- [Play guide](../docs/MILESTONE_2_PLAY_GUIDE.md).
- [Netlify deployment instructions](../docs/NETLIFY_DEPLOYMENT_MILESTONE_2.md).
- [Browse sample screenshots](milestone2-screenshots/).

147 browser checks, 67 pure simulation checks and five packaged-build checks passed. Physical Windows/iPhone Safari, device performance and human difficulty balance still require your trial. Historical sources blocked by the cloud proxy are identified in the source audit. The Gemini-generated interview summary supplies themes, not verified quotations. The actual October 12, 1967 Coker–McKnight escape ended in recapture; successful escape branches are fictional.

## Save and deploy on Windows

1. Sign into GitHub with the account that has access to this private repository.
2. Click the playable ZIP link above and save the file. Alternatively, open the ZIP in the repository and click **Download raw file** (the down-arrow button).
3. In Windows File Explorer, right-click `Intruder_Yankee_Station_Milestone2.zip` and choose **Extract All**.
4. Upload the extracted folder to Netlify's manual deploy interface. The uploaded folder must contain `index.html`, `assets/`, and `_headers` at its root. Upload the playable ZIP's extracted contents, rather than the entire source repository or evidence ZIP.
5. Open the resulting HTTPS URL on Windows and in iPhone Safari. Choose **Enter Ready Room → Enter the prison**. Follow the play guide for controls and device testing. Saves are local to that browser and site.

The `milestone2` branch is separate from the existing Milestone 1 branches. This delivery does not change the live Netlify site. Use a separate Netlify site or retain your previous deployment for comparison.

## Milestone 2 implementation and exact build

- Prison, guard AI and enhanced historical media: `483e7c3`.
- Extended river journey and alternate rescue: `8b79227`.
- Captivity, tap code, checkpoints and touch/graphics recovery: `ba5c2f2e29e8dba5e0fdeff939dccdbb8aa0be91`.
- The later delivery commit adds release files and documentation; runtime bytes match the tested source commit above.
- `milestone2-build-manifest.json` lists all 48 runtime file hashes. `milestone2-summary.json` records test counts, scope and reruns. `SHA256SUMS.txt` covers both milestones' downloadable files.
- Deployment ZIP: 22,289,476 bytes; SHA-256 `60b157363a58f6300ebafe8d2d91c3fb170f72fd6f3d9f94aa48d1ff142428ce`.
- Evidence ZIP: 79,512,268 bytes; SHA-256 `6eb5325126387b7929e32953cfc1fbe8d94c482046ed15fb6f8706462fb8fc3f`.

## Preserved Milestone 1 downloads

- [Original Milestone 1 playable ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/main/releases/Intruder_Yankee_Station_Milestone1.zip).
- [Original Milestone 1 test evidence](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/main/releases/Intruder_Yankee_Station_Milestone1_Evidence.zip).
- [Milestone 1 report](../docs/MILESTONE_1_TEST_REPORT.md) and [deployment instructions](../docs/NETLIFY_DEPLOYMENT.md).

## Preserved release and history

- Untouched V11 baseline: `5e32916bbaa83d442b7e6fa0891e138ebc7c3c7d`, tag `chatgpt-v11-baseline`.
- Final verified Milestone 1: `15b039289261be44d9ba5ae7a95b468a5a33501b`, tag `milestone1-verified`.
- Full original Git history is retained. The later delivery commit adds release files only.
- `build-manifest.json` and `release-summary.json` retain the original Milestone 1 build information unchanged.
- Deployment ZIP: 19,966,827 bytes; SHA-256 `e9cdc607d514cbf95fc04932b64423689912ee7311c97893d477f0c036de9257`.

Milestone 1 recorded 67 browser regressions and three deployment checks. The user subsequently reported successful Windows deployment. All original commits and release files remain available.
