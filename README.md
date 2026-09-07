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

The viewer loads **`BoxModel.fbx`** and its print (`3DModel.fbm/3DModel.jpg`). You can also drag another `.fbx` onto the page.

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
