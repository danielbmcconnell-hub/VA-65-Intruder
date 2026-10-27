# Reproducing Ocean Survival checks

From the source checkout, install its locked development dependencies with `npm ci`. Browser checks require Chromium and a loopback HTTP server; in the verified environment Chromium was `/usr/bin/chromium` using SwiftShader. This is a renderer/input check, not hardware performance or physical Safari validation.

```sh
node releases/ocean-survival-verification/run-all-cpu.cjs repeat
npm run test:ocean-survival
node releases/ocean-survival-verification/run-river-demo.cjs
npm run build
npm run test:build
```

The CPU helper discovers all CPU-only test programs, records source/test hashes, writes a TAP log and rejects any changing inventory. The river helper enters the original river practice chapter, runs the original MissionDemo controller and 1/30-second game updates, and requires actual offshore acknowledgement, rescue and campaign isolation. It renders the gulf until jellyfish artwork is ready before resuming physics. It fast-forwards simulated time and does not establish full-campaign or FPS results.

Portable copies change repository and output path resolution from the original external helpers. Their own file hashes therefore differ from the original report harness hashes; the recorded runtime source hashes remain independently comparable. Reruns write `test-results/`, leaving the committed release evidence unchanged. Individual native suites under `tests/` carry their declared checkpoint and camera fixture scope. The popup evidence has the single later jellyfish rendering difference documented in `../ocean-survival-source-coverage.json`.

The exact package inventory and hashes are in `../ocean-survival-build-manifest.json`. The external delivery receipts record CRC, byte-for-byte ZIP/runtime matching, an independently fetched Git object store, and preservation of prior media and release refs. The GitHub archive has the same runtime tree in a wrapping folder; its archive bytes differ from the local ZIP.
