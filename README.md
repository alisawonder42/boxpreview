# Box Preview

A standalone **Three.js** piece: a photogrammetry-scanned ornamental box sitting on a desk. Drag to explore it.

Built to live on its own, then be injected later into [katarinarankovic.fyi](https://katarinarankovic.fyi) as an iframe or a dropped-in folder.

## Look

Gallery cream, a studio environment, and a grainy desk. Physical materials, ACES tone mapping, and soft sun shadows.

## Run

```bash
npm install
npm run dev
```

Production build: `npm run build`. Preview it with `npm run preview`.

## Your scan

The viewer loads **`Box-cleaned.glb`**. You can also drop another `.glb` or `.fbx` onto the page.

## GitHub Pages

`https://alisawonder42.github.io/boxpreview/`  
Embed: `https://alisawonder42.github.io/boxpreview/?embed=1`

`npm run build` refreshes the committed `assets/viewer.js` bundle. `boot.js` loads that bundle when Pages serves the source `index.html`.

## Inject into the portfolio

```html
<iframe
  src="https://alisawonder42.github.io/boxpreview/?embed=1"
  title="Box preview"
  style="width:100%;height:72vh;border:0;background:#e4dfd4"
  allow="fullscreen"
></iframe>
```

`?embed=1` hides the title chrome so only the object remains.

Or copy `src/viewer` into the portfolio and mount the canvas there. It is vanilla Three.js — no React.

## Emerald square lens

Move the pointer over the canvas to reveal an emerald metallic rendering in a square.
Drag to rotate as before. The original and emerald passes share a camera, geometry,
and full drawing-buffer resolution, so the relief stays aligned. Normal, bump, and
AO maps are retained when supplied by a model. Fine mint/gold glints follow the
surface; restrained horizontal interference and grain are composited afterward.
Use **Look → Emerald Lens** to tune square size, roughness, reflections, glints,
grain, interference, and animation speed. Animation respects reduced-motion settings.
The extra material pass runs only while the lens is active.

Validation: production build passes. The available remote preview browser has
WebGL disabled, so GPU shader compilation and visual matching need verification
in a WebGL-capable browser.
