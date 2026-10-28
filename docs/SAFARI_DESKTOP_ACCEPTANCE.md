# Milestone 1 — Safari and Windows acceptance gate

This is a compatibility maintenance pass, **not Milestone 2**. It does not
replace the WebGL2 engine, flight physics, mission definitions, family
photographs, or historical A-6A model.

## Automated checks (required)

From a clean checkout at the candidate commit:

```sh
npm ci
python3 -m pip install -r requirements-dev.txt
npx playwright install chromium webkit
npm run test:assets
npm test
npm run test:webkit
npm run build
npm run test:build
```

`npm test` includes desktop and iPhone-layout Chromium lifecycle tests;
`npm run test:webkit` runs the focused desktop/iPhone-layout smoke against
Playwright WebKit. The ZIP audit extracts the generated archive and checks
each runtime asset by SHA-256, including the required Netlify `_headers`.

These tests **do not certify an Apple Safari installation, a real iPhone,
Windows GPU performance, or audible voice quality**.

## Physical iPhone Safari (required; record device/iOS version)

Deploy the **candidate ZIP** from the successful CI run to a private HTTPS
site, with `index.html`, `assets/`, and `_headers` at the site root.
Open the HTTPS URL directly in Safari, **not** in Files or an embedded preview.

1. Start in portrait, open a flight, and confirm the orientation notice.
   Rotate to landscape. The flight must be paused until Resume is tapped.
   Check both orientations again after at least one minute of flight.
2. In landscape, check notch/home-indicator clearance and test each visible
   pilot/B/N control, including the stick, held throttle, COMMIT, chart,
   eject confirmation, and pause/resume. Check the on-foot controls after
   ejection (run, crouch, radio, smoke, weapon selection, attack and surrender).
3. Fly the Training Mission for at least ten continuous minutes, including
   at least one full takeoff and carrier landing. Record whether the
   airframe remains controllable and whether the cockpit/HUD remain legible.
   Repeat at Low and Medium graphics. Record sampled frame rate if an
   instrumented Safari session is available; otherwise report subjective
   stutters separately from measured FPS.
4. During active flight, switch to another app for 30 seconds and return;
   do the same for five minutes, and briefly lock/unlock the phone.
   The session must remain paused with neutralized controls. Tap Resume
   and verify normal flight, sound, and captions.
5. Test spoken B/N and pilot voices, warning tones, aircraft engines and
   sound-off, listening for clipping, silence or speech not restarting.
   Captions must remain readable even when the platform lacks a voice.
6. Repeat a long ground/survival sequence and inspect portraits. If
   WebGL graphics reset or Safari terminates the tab, record exact symptoms.
   WebGL context recovery can preserve an in-memory mission; a complete
   WebKit process eviction/reload is **not** guaranteed to preserve an
   unfinished flight. Persistent Cruise Log and settings should survive
   a normal reload.

## Physical Windows Chrome/Edge (required; record hardware/browser)

1. On the same HTTPS candidate, start and complete a Training Mission,
   including takeoff, bombing practice if applicable, and carrier landing.
2. Confirm keyboard, mouse/pointer-lock (when enabled), cockpit controls,
   graphics settings, flight instruments, menus and debrief.
3. Alt-Tab to another app during flight and return. Verify the paused
   menu, neutral control states, and deliberate Resume. Resize the browser
   and toggle fullscreen. Test a recovered WebGL context when possible.
4. Fly for at least 15 continuous minutes and repeat with High graphics.
   Monitor frame rate, GPU warnings, fan/throttle behavior and sound mixing.
5. Verify no broken photographs or missing assets and that Cruise Log
   progress survives a reload.

## Release gate and evidence

Record a dated result for both target devices: model, operating system,
browser version, tested commit SHA, ZIP SHA-256, Netlify URL, steps passed,
measured FPS where available, failures, and screenshots/logs. Mark release
**blocked** if either device cannot complete a flight/landing, core controls
are unreachable, interruption causes uncontrolled flight, or the runtime
crashes repeatedly. Do not mark physical-device tests passed based on
emulated-touch Chromium or Playwright WebKit alone.

The CI ZIP is a **candidate**; the existing release ZIP under `releases/`
is still the October 8 baseline until acceptance and an explicit release
update. Keep the reference-photo folders and original archive out of
Netlify deployments. Review repository visibility and site access before
sharing family photographs.
