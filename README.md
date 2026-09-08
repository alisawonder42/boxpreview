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

## Rigid box surface corruption

The active effect resamples the original rendered box into restrained horizontal
strips. It never displaces vertices or moves the silhouette. A depth-tested object
mask includes scene occluders and alpha cutouts; geometric normals protect sharp
face creases. A narrow rim stays untouched, and shifted color samples outside the
subject or across a sharp face boundary fall back to the original pixel.

The original scene renders directly first. Only affected interior pixels are then
overwritten with an opaque blend, preserving the background and antialiased outline.
The pattern is anchored in subject-local coordinates reconstructed from visible
depth. Bands, color fragments, scanlines and texture offsets follow the box faces
through orbit and rotation; the cursor only reveals them. Offset controls use
nominal surface pixels (300 across a face), independent of zoom.

The fixed 300px cursor square intersects the object mask; only their overlap is
affected. Pointer leave disables the overlay. Drag/orbit, reset, resize, and model replacement remain
available. Reduced-motion preferences freeze the corruption pattern.

**Look → Box · horizontal corruption** exposes scanlines, band coverage, strip
offset, tears, RGB split, square size, color strength/density, optional band noise,
blend, and animation speed. Magenta, cyan, green, blue and rare red fragments appear
only in damaged rows. The initial coverage is 22% of square height, before edge protection, with a
70% blend within those bands. Actual affected surface area varies with the view;
most of the texture stays readable. Noise defaults to zero.

The older implementations remain in `technicalLens.ts` and `analogCRT.ts`, disabled
by default, omitted from the active render chain, and hidden from the GUI. To
restore them later, explicitly enable and reconnect those modules in `app.ts`.

Validation:

```bash
npm run build
node scripts/test-lens.mjs
node scripts/test-signal.mjs
node scripts/test-shader.mjs /path/to/glslangValidator
node scripts/test-corruption.mjs /path/to/glslangValidator
```

The tests cover capture sources, mask/occluder materials, cutouts, render-state
restoration, reduced motion, disabled bypass, and GLSL compilation/linking. The
remote browser has WebGL disabled; visual matching needs a WebGL-capable browser.
