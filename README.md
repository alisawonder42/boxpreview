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

## Printed surface and scanner lens

The fixed cursor square reveals an opaque composite only where it overlaps the
visible jewelry box (`cursorSquareMask * objectMask`). Original scene pixels stay
untouched outside that intersection. Geometry never moves; the composite protects
the silhouette rim and sharp creases and rejects samples outside the subject.

The shader reconstructs subject-local positions from visible depth. Fine diagonal
cross-hatching uses smoothly blended triplanar projections with isotropic spacing.
Rendered luminance controls the strength of each diagonal direction; deep shadows
reveal extra interleaved lines. Fixed line coordinates do not slide when lighting
changes. Derivative filtering fades unresolved detail to reduce moire.

The completed treatment combines print shading, restrained scanner lines/sweep,
fragmented horizontal offsets, occasional black bands, stretches and duplicated
source fragments, subtle RGB separation and localized cyan/magenta/rare green
accents. Colored rows retain independent sideways speed, phase and pulse timing.

One final blend controls the entire treatment, including color. The default is
75% original plus 25% treated color in linear space, with fully opaque output.
Perceived appearance still depends on lighting and tone mapping.

**Look → Box · horizontal corruption** provides overall effect opacity and square
size; **Print shading** controls hatch strength, density and ink width;
**Scanner** controls line strength, sweep strength and speed; **Color artifacts**
controls color strength/density and sideways motion. The remaining controls tune
corruption coverage, offsets, tears, RGB separation and optional noise (off).

The original `technicalLens.ts` implementation is available as an optional layer;
`analogCRT.ts` remains archived, disabled and hidden. The old scanner used geometry normals, a five-tone relief
palette, points, broken green streaks and optional row cycling. It is separate
from the currently active scanner lines and sweep.

Validation:

```bash
npm run build
node scripts/test-corruption.mjs --logic-only
node scripts/test-shader.mjs /path/to/glslangValidator
node scripts/test-corruption.mjs /path/to/glslangValidator
```

Logic tests cover render state, pixel-density scaling, stable surface coordinates,
cursor independence, reduced motion and disabled bypass. GLSL compilation requires
the external validator; real GPU visual review remains necessary.

### LED screen layer

Fine vertical RGB subpixel triplets modulate the original lit surface and follow
its triplanar coordinates, clipped by the same cursor-square/object mask. They
compose with the hatch and scanner before the final 25% overall blend. The LED
screen folder exposes enable, strength, spacing (nominal 600-unit surface scale),
gap, softness and RGB/monochrome mode. Derivative filtering fades unresolved
stripes to prevent distant moire; no RGB bars are drawn on the background.

### Original dot scanner layer

Enable **Original dot scanner · layer** in debug to combine the original five-tone
normal/relief scanner, dots and symbols with the print/scanner/LED treatment. It
defaults off, with 35% layer opacity when enabled. Dot opacity is independent of
the main effect opacity; at 100% it covers the underlying treatment. Grid spacing,
density, size, intensity, flicker, relief, scanlines, broken streaks, animation, row
cycling, symbols and the five palette colors are editable. The square size is
shared. Capture-only rendering feeds its real output into the final compositor,
which applies the same visible-object mask and protected silhouette. The original
dot grid retains its screen-space construction. Bloom and grain are not included
in this captured layer. The main effect enable is the master toggle.

### Surface distance

Surface distance (default 2 CSS pixels, range 0–12) offsets the sampled treatment
along the projected visible geometry normals. Depth reconstruction, print, scanner,
LED and captured dots use the shifted source, while the original image and final
cursor/object mask remain fixed. Two inverse reprojection iterations approximate
a thin hovering layer; this is not a separate displaced mesh or a physically
accurate shell. Sources across the silhouette or sharp creases are rejected.
Zero restores contact with the surface; front-facing regions have little lateral
shift. The mask uses geometry normals, not an invented normal map.
