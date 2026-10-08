# Intruder: Yankee Station — six historical image assets

Integrate these six source-preserving enhanced images into the existing Milestone 1 game without replacing or removing the original assets, changing flight or ground mechanics, or rewriting the custom renderer.

Assets have identical content as the supplied originals, with resolution scaling, sharpening/contrast, and modest color grading. The monochrome **LTJG Coker May 1966** and **Hanoi Hilton aerial** images have **interpretive estimated coloring**; the original monochrome images must remain available for historical mode and credits. Do not treat estimated colors as established fact. Because the Coker source is tiny, don't attempt synthetic face reconstruction or change identity features.

Files: use `.webp` for deployed HTML pages and `.png` only for archival/master artwork.

Suggested placements, subject to current game content and historical context:
- `pow_roll_call_1960s.webp` — POW camp history/briefing and captivity chapter, with caption that this is supplied illustrative imagery unless its provenance is verified.
- `ltjg_coker_may_1966_colorized.webp` — Coker biographical or Escape of Coker and McKnight history card, with the source caption `May 1966` retained. Do not label his photo as the game's protagonist.
- `hanoi_hilton_aerial_colorized.webp` — historical context/POW facilities briefing. Preserve the sign baked into the image.
- `pow_prison_courtyard.webp` — prison overview/history/transition imagery.
- `pow_interrogation_scene.webp` — *illustrative* interrogation material; verify provenance before labeling it as a historical recording of any specific event or person.
- `pow_group_repatriation.webp` — POW release/Homecoming epilogue and historical notes, label only if confirmed from source data.

Implementation:
1. Copy optimized WebP images into `assets/history/`, keeping filenames stable. Keep master PNGs under reference media or in a non-deployed `artwork/` folder to avoid bloating mobile downloads.
2. Add a single centralized `historicalPhotoAssets` mapping to game HTML/JS (or your existing asset registry), not scattered hard-coded paths.
3. Display images without overlay contamination or transparency: `object-fit:contain; opacity:1; filter:none; mix-blend-mode:normal;` with the natural aspect ratios and caption space.
4. Lazy-load images on demand. Avoid multiple 4K decoded textures in the WebGL scene at once; prefer HTML elements for static photographs.
5. Keep the title-screen tribute photo of William S. McConnell unchanged. The 1966 Coker portrait is a separate person and should be in the Coker history section only.
6. Add image preloading/404 smoke checks and a browser screenshot to visual regression tests. Confirm images on desktop and mobile Safari.
7. Add appropriate factual captions, sources, and an asset rights/credit ledger. Source rights have not been established simply by image upload.
8. Give me a new tested deployable ZIP or push a tested Git commit after integration.
