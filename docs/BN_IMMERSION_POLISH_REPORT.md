# B/N Immersion & Visual Polish

This pass makes the existing B/N strike, photographic guards, nearby ground contact and flight sound easier to read. It retains the custom WebGL2 engine, twelve missions, original A-6A model/markings/flight physics, weapons and earlier chapters. Original family photographs and historical source assets remain byte-for-byte preserved. [Play guide](BN_IMMERSION_POLISH_PLAY_GUIDE.md).

## Changes

- **B/N:** the target chart cycles through ×1/×2/×4. Selecting a published landmark and then a candidate measures their bearing/range offset. The banded water tower is published at its actual grounded scenery position. A compact live strip keeps original steering error, consent and ASQ release time visible with the worksheet closed. It is advisory; original designation, clearance and release remain authoritative. No hidden target identity is supplied.
- **Strike aftermath:** real target destruction and existing secondary events drive distinct fuel billows and ammunition flashes/sparks. Effects retain bounded particles/lights and do not create extra damage, score events or target identities.
- **Guards:** the existing intact photographic cutouts gain restrained opposing shoulder/knee movement, ready poses from actual alert states and a brief lean after real hits. Travel drives gait; pause freezes it and the photographed foot line stays anchored. This is authored articulation of existing photographs, with no new photography or filmed gait.
- **Nearby ground:** a streamed 33×33 R32F texture supplies unchanged CPU collision heights to the visible and shadow terrain passes. Sampling is limited to 128 heights per render preparation; GPU storage is 4,356 bytes (about 4.3 KiB). Correction is full within 64 m and fades out by 112 m. Actors and aircraft physics are unchanged.
- **Audio:** observed playback of owned browser speech extends the existing engine duck briefly. Actual aircraft hits produce distinct cannon/blast transients through the existing audio graph; lifecycle cleanup releases effects and owned focus.

## Evidence and limits

Final validation counts: **905 domain checks in 53 suites; 225 source-browser checks in 14 selected suites; 17 packaged-build checks.**. Tested source commit: **240354442f5d3806d0f3cdeb4277c7a350ffdad3**.

Focused browser evidence is under `test-results/bn-target-polish-final`, `guard-motion-final`, `near-ground-new`, `strike-sensory-final` and `sortie-focus-audio-final`. These use actual Linux Chromium/SwiftShader WebGL2 and desktop/touch layouts. Node checks, genuine GPU fixtures and input-driven flight regressions establish different things; isolated screenshots do not prove a naturally flown sortie. Final regression totals and packaged-build checks identify their own scope. Unchanged focused results were reused; the changed strike-effects suite was rerun after a saturated-particle RNG regression was corrected by omitting optional extra fragments.

Chart checks use native practice launch and chart input, then pause animation for UI invariants. Guard checks include native prison patrol/noise/pause and separate shader comparisons. Strike pictures use isolated copies of real World/FX with production detonation and secondary code; they do not show player-released bombs. Terrain checks measure original shader probes/transform feedback and a declared stationary guard. Audio checks measure real WebAudio nodes; an explicitly forced observed-speech flag checks ducking where native speech is unavailable. No listening result is claimed.

The packaged UI test suspends automatic frames while explicitly advancing original flight physics, then resumes the native scheduler for chapter startup. An earlier unconstrained-clock run lost the worksheet during a visibility/geometry check under concurrent software rendering; assertions were retained in the controlled-clock run.

Terrain correction initially takes nine render calls and refreshes while moving. Original terrain remains beyond 112 m; shoreline blending, 8 m triangles, cliffs and excluded raised POW/camp/river floors limit universal contact accuracy. Physical Windows/iPhone Safari, hardware FPS, subjective animation and sound balance remain unvalidated. Existing historical qualifications still apply; authored scenery is representative rather than a surveyed reconstruction.

## Delivery

Private GitHub branch: `bn-immersion-polish`. Complete static release: [Intruder_Yankee_Station_BN_Immersion_Polish.zip](../releases/Intruder_Yankee_Station_BN_Immersion_Polish.zip). The runtime ZIP excludes source archives, Git metadata, dependencies and test evidence. The live Netlify site has not been redeployed.

## Archive verification

Complete Netlify ZIP: **Intruder_Yankee_Station_BN_Immersion_Polish.zip**, 34,767,828 bytes and 154 exact runtime files. SHA256: `3834cdacd51bfc5933a5f444c4954e9961f34e254e1c7d525260906de2b4388c`. The evidence ZIP includes 60 decoded screenshots and the selected final JSON/log reports.

| Source-browser suite | Passed checks |
| --- | ---: |
| bn-target-polish | 10 |
| strike-sensory | 10 |
| guard-motion | 8 |
| near-ground | 8 |
| flight-audio-focus | 10 |
| renderer | 6 |
| missions | 22 |
| progression | 26 |
| m24-ammunition | 22 |
| dixie-strike | 26 |
| episode | 49 |
| bn-recognition | 10 |
| hud-opacity | 12 |
| willard-lifecycle | 6 |
