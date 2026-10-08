# Milestone 1 — completed game downloads

These are the existing verified release files. The GitHub transfer did not rebuild or modify the game.

- [Download the playable Netlify ZIP](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/main/releases/Intruder_Yankee_Station_Milestone1.zip)
- [Download screenshots and test evidence](https://github.com/danielbmcconnell-hub/VA-65-Intruder/raw/refs/heads/main/releases/Intruder_Yankee_Station_Milestone1_Evidence.zip)
- [Test report](../docs/MILESTONE_1_TEST_REPORT.md)
- [Netlify deployment instructions](../docs/NETLIFY_DEPLOYMENT.md)

## Save and deploy on Windows

1. Sign into GitHub with the account that has access to this private repository.
2. Click the playable ZIP link above and save the file. Alternatively, open the ZIP in the repository and click **Download raw file** (the down-arrow button).
3. In Windows File Explorer, right-click `Intruder_Yankee_Station_Milestone1.zip` and choose **Extract All**.
4. Upload the extracted folder to Netlify's manual deploy interface. The uploaded folder must contain `index.html`, `assets/`, and `_headers` at its root. Upload the playable ZIP's extracted contents, rather than the entire source repository or evidence ZIP.
5. Open the resulting HTTPS URL on Windows and in iPhone Safari. Follow the deployment instructions for controls and device testing.

## Preserved release and history

- Untouched V11 baseline: `5e32916bbaa83d442b7e6fa0891e138ebc7c3c7d`, tag `chatgpt-v11-baseline`.
- Final verified Milestone 1: `15b039289261be44d9ba5ae7a95b468a5a33501b`, tag `milestone1-verified`.
- Full original Git history is retained. The later delivery commit adds release files only.
- `build-manifest.json` identifies the verified game commit and runtime hashes. `SHA256SUMS.txt` identifies these exact downloadable files.
- Deployment ZIP: 19,966,827 bytes; SHA-256 `e9cdc607d514cbf95fc04932b64423689912ee7311c97893d477f0c036de9257`.

The recorded checks passed: 67 browser regressions and 3 deployment checks. Physical Windows/iPhone testing remains the user's device trial; Milestone 2 has not begun.
