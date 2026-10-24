# Assets

| File | What it is | Source |
|---|---|---|
| `banner.png`, `social-preview.png` | README banner and the 1280 x 640 social preview | Composed from `hero.png` and `screens/portfolio.png` |
| `hero.png` | Metro train at dusk under a signalling network | `src/make-illustrations.mjs` |
| `workflow.png` | Control tower linked to dashboard panels | `src/make-illustrations.mjs` |
| `screens/*.png` | Real screenshots of the showcase build | Captured in Chromium at 1366 x 860 and 390 x 844 |

Regenerate the illustrations with `node docs/assets/src/make-illustrations.mjs` and render the SVGs to PNG in any browser.

## GitHub social preview

GitHub only accepts the repository social preview through the web interface: **Settings, General, Social preview, Upload an image**, then choose `social-preview.png`.

## Canva originals

Two concept images were also generated in Canva (a metro train at dusk, and a control tower with dashboard panels). Their full-resolution files could not be downloaded from the build environment, so the illustrations above are vector renderings of the same two concepts. The originals are in the Canva library under the media ids `MAHY31_wgfM` and `MAHY3wACvC4`.
