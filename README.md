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

Drop the cleaned KIRI file at `public/models/box.glb`. Until that file is in the repo, the viewer uses a patterned stand-in and you can drag a `.glb` / `.fbx` onto the page.

## Live preview

Temporary Vercel deploy with your `Box-cleaned.glb` scan (claim it to keep it):

- Viewer: https://temporary-rushing-viola-o9usqam.vercel.app/
- Embed (no chrome): https://temporary-rushing-viola-o9usqam.vercel.app/?embed=1
- Claim on your Vercel account: https://vercel.com/claim-deployment?code=1785481c-012d-4b3c-817a-227fd766e3a6

## Inject into the portfolio

```html
<iframe
  src="https://temporary-rushing-viola-o9usqam.vercel.app/?embed=1"
  title="Box preview"
  style="width:100%;height:72vh;border:0;background:#f4f1ea"
  allow="fullscreen"
></iframe>
```

`?embed=1` hides the title chrome so only the object remains.

After you claim the deployment, swap the `src` for the permanent Vercel URL.

Or copy `src/viewer` into the portfolio and mount the canvas there. It is vanilla Three.js — no React.
