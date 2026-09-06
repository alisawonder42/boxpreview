# Box Preview

A standalone **Three.js** piece: a scanned ornamental box on a museum stand. Drag to turn it, the way a store lets you look at an object. Hold, and it becomes liquid — the print stays — and begins to fall from the stand.

Built to live on its own, then be injected later into [katarinarankovic.fyi](https://katarinarankovic.fyi) as an iframe or a dropped-in folder.

## Look

Gallery cream meeting daylight museum. Physical materials, a studio environment, soft sun shadows, GTAO, SMAA, and a little bloom only while it melts.

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

GitHub still Jekyll-deploys the repo root after the Vite Actions job, so the live page is often the source `index.html` (`/src/main.ts`). That script never runs, which is why the footer stays on **Looking for a scan…** even though `BoxModel.fbx` is already on the site. `boot.js` loads the last committed `assets/viewer.js` in that case.

`npm run build` refreshes that bundle. The Actions workflow still uploads `dist` when GitHub Actions is the Pages source.

## Live preview

Temporary Vercel deploy with your `Box-cleaned.glb` scan (claim it to keep it):

- Viewer: https://temporary-rapid-zither-7mxq8tw.vercel.app/
- Embed (no chrome): https://temporary-rapid-zither-7mxq8tw.vercel.app/?embed=1
- Claim on your Vercel account: https://vercel.com/claim-deployment?code=ef63fc91-5b6e-4f31-a09b-2a5ed31cf5a8

## Inject into the portfolio

```html
<iframe
  src="https://temporary-rapid-zither-7mxq8tw.vercel.app/?embed=1"
  title="Box preview"
  style="width:100%;height:72vh;border:0;background:#f4f1ea"
  allow="fullscreen"
></iframe>
```

`?embed=1` hides the title chrome so only the object remains.

After you claim the deployment, swap the `src` for the permanent Vercel URL.

Or copy `src/viewer` into the portfolio and mount the canvas there. It is vanilla Three.js — no React.
