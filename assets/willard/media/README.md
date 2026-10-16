# MiG-17PF — Willard Egress game asset pack

## Contents
- `MiG17PF_Willard_Egress_ATLAS.png` — 4096 × 3584 transparent RGBA sprites.
- `MiG17PF_Willard_Egress_ATLAS.json` — frame coordinates, 512 × 512 cells, pivots, headings and approximate roll states.
- `sprites/*.png` — 54 transparent individual frames, exactly 512 × 512 each.
- `PREVIEW.jpg` — labeled contact sheet for browsing.
- `index.html` — browser demo with touch and keyboard steering. Deploy the whole ZIP to Netlify or serve locally with `python -m http.server`.

## Sprite naming
`flight_h00_b+00` points screen UP, bank 0°.
`flight_h04_b+00` points RIGHT (90° clockwise).
`flight_h08_b+00` points DOWN.
`flight_h12_b+00` points LEFT.
`_b-30` and `_b+30` are approximated 2D bank poses. Headings are stepped every 22.5°.
Orthographic references: `left_side`, `right_side`, `top`, `bottom`, `front`, `rear`.

## Rendering with Canvas
```
const f = atlasData.frames['flight_h04_b+00'].frame;
ctx.drawImage(atlasImage, f.x, f.y, f.w, f.h, x-128, y-128, 256, 256);
```
For smooth rotation, prefer dynamically rotating a single top view instead of discrete 16-way snapping; the numbered frames exist for sprite-only engines and transition previews.

## Historic / technical cautions
This is original AI-generated game art, **not** a dimensionally verified scale model. The MiG-17PF historically had the Izumrud radar's prominent upper-intake-lip fairing and central intake bullet, six wing fences (three each wing), curved swept wings rather than a MiG-21 delta, and nose cannon armament. The original 1966 Willard Egress pursuer's type is unconfirmed; depiction as MiG-17PF is a plausible **fictionalization**, not an established historical identification. The red serial `5123` is fictional and should not be treated as a documented aircraft from that incident.
The top-down roll frames are screen-space foreshortening, **not** accurate aircraft 3D bank or flight dynamics. If a game uses an oblique camera, create a rigged 3D model and bake its roll/pitch angles for exact consistency.

## Sources for shape verification
- MiG-17 design and wing fencing: https://toad-design.com/migalley/index.php/jet-aircraft/mig17/nggallery/page/2
- MiG-17PF Izumrud radar configuration: https://warplanedata.com/mig-17p.html
- Wikimedia Commons drawings: https://commons.wikimedia.org/wiki/Category:Mikoyan-Gurevich_MiG-17_drawings
