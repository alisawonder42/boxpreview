import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export const DEFAULT_CORRUPTION = {
  enabled: true, squareSize: 300, surfaceDistance: 2, colorStrength: 0.35, colorDensity: 0.25,
  colorMotionSpeed: 0.55, colorMotionTravel: 14, colorMovingDensity: 0.7,
  ledEnabled: true, ledStrength: 0.45, ledPixelSize: 7.62, ledGap: 0, ledBlur: 0.08, ledRgbMode: true,
  hatchStrength: 0.65, hatchDensity: 90, hatchWidth: 0.12,
  scanlineStrength: 0.12, scannerSweepStrength: 0.08, scannerSpeed: 0.25, bandCoverage: 0.16,
  bandOffsetStrength: 6, tearAmount: 0.15, rgbSplitAmount: 0.35,
  noiseAmount: 0, blendAmount: 0.25, animationSpeed: 1,
}
export type CorruptionParams = typeof DEFAULT_CORRUPTION

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tMask;
uniform sampler2D tDepth;
uniform sampler2D tDots;
uniform float uDotOpacity;
uniform mat4 uClipToObject;
uniform mat4 uObjectToClip;
uniform vec3 uObjectMin;
uniform vec3 uObjectSize;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform vec2 uSquareSize;
uniform float uColorStrength;
uniform float uColorDensity;
uniform float uColorMotionSpeed;
uniform float uColorMotionTravel;
uniform float uColorMovingDensity;
uniform float uPixelRatio;
uniform float uTime;
uniform float uScanlineStrength;
uniform float uScannerSweepStrength;
uniform float uScannerSpeed;
uniform float uBandCoverage;
uniform float uBandOffsetStrength;
uniform float uTearAmount;
uniform float uRgbSplitAmount;
uniform float uNoiseAmount;
uniform float uBlendAmount;
uniform float uSurfaceDistance;
uniform bool uLedEnabled;
uniform bool uLedRgbMode;
uniform float uLedStrength;
uniform float uLedPixelSize;
uniform float uLedGap;
uniform float uLedBlur;
uniform float uHatchStrength;
uniform float uHatchDensity;
uniform float uHatchWidth;
varying vec2 vUv;
float boxHash(float p) { return fract(sin(p * 127.1 + 91.7) * 43758.5453); }
float boxMask(vec2 uv) {
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return texture2D(tMask, uv).a;
}
float boxSurface(vec2 uv, vec3 normal) {
  vec3 other = normalize(texture2D(tMask, clamp(uv, 0.0, 1.0)).rgb * 2.0 - 1.0);
  return boxMask(uv) * step(0.8, dot(normal, other));
}
// Protect the destination rim AND reject sources at or beyond the silhouette.
// The original base is already on screen; discarded pixels are never rewritten.
float boxInterior(vec2 uv) {
  vec2 d = vec2(2.5 * uPixelRatio) / uResolution;
  vec3 normal = normalize(texture2D(tMask, uv).rgb * 2.0 - 1.0);
  float m = boxMask(uv);
  if (m < 0.999) return 0.0;
  m = min(m, boxSurface(uv + vec2(d.x, 0.0), normal));
  m = min(m, boxSurface(uv - vec2(d.x, 0.0), normal));
  m = min(m, boxSurface(uv + vec2(0.0, d.y), normal));
  m = min(m, boxSurface(uv - vec2(0.0, d.y), normal));
  m = min(m, boxSurface(uv + d, normal));
  m = min(m, boxSurface(uv - d, normal));
  m = min(m, boxSurface(uv + vec2(d.x, -d.y), normal));
  m = min(m, boxSurface(uv + vec2(-d.x, d.y), normal));
  return step(0.999, m);
}
vec3 boxRead(vec2 uv, vec3 original) {
  vec3 normal = normalize(texture2D(tMask, vUv).rgb * 2.0 - 1.0);
  if (boxInterior(uv) < 0.5 || boxSurface(uv, normal) < 0.5) return original;
  return texture2D(tScene, uv).rgb;
}
vec2 boxProject(vec3 position) {
  vec4 clip = uObjectToClip * vec4(position, 1.0);
  if (clip.w <= 0.0) return vec2(-1.0);
  return clip.xy / clip.w * 0.5 + 0.5;
}
// Fixed-frequency ink lines: lighting changes opacity, never their position.
float printLine(float coordinate) {
  float footprint = max(fwidth(coordinate), 0.0001);
  float distanceToLine = abs(fract(coordinate + 0.5) - 0.5);
  float ink = 1.0 - smoothstep(uHatchWidth * 0.5 - footprint,
    uHatchWidth * 0.5 + footprint, distanceToLine);
  return ink * (1.0 - smoothstep(0.35, 0.8, footprint));
}
float printCross(vec2 plane, float shadow) {
  vec2 diagonal = vec2(plane.x + plane.y, plane.x - plane.y) * 0.70710678;
  float first = printLine(diagonal.x * uHatchDensity) * smoothstep(0.05, 0.6, shadow);
  float second = printLine(diagonal.y * uHatchDensity) * smoothstep(0.3, 0.85, shadow);
  // Interleaved fine lines emerge only in deep shadows, without shifting the base grid.
  float dense = printLine(diagonal.x * uHatchDensity * 2.0) * smoothstep(0.65, 1.0, shadow) * 0.35;
  return max(max(first, second), dense);
}
// RGB triplets are fixed to each object projection, not to the cursor or screen.
vec3 ledTriplet(float position) {
  float coordinate = position * 600.0 / max(uLedPixelSize, 1.0);
  float footprint = max(fwidth(coordinate), 0.0001);
  float softness = max(footprint * 0.5, uLedBlur / 6.0 + 0.0001);
  vec3 distanceToCenter = abs(fract(vec3(coordinate) - vec3(1.0 / 6.0, 0.5, 5.0 / 6.0) + 0.5) - 0.5);
  float halfWidth = (1.0 - uLedGap) / 6.0;
  vec3 stripes = vec3(1.0) - smoothstep(vec3(halfWidth - softness), vec3(halfWidth + softness), distanceToCenter);
  // Suppress unresolved subpixels at distance to avoid colored moire.
  float resolved = 1.0 - smoothstep(0.12, 0.4, footprint);
  vec3 modulation = vec3(0.2) + 2.4 * stripes;
  if (!uLedRgbMode) modulation = vec3(dot(modulation, vec3(1.0 / 3.0)));
  return mix(vec3(1.0), modulation, resolved);
}
void main() {
  // Both masks use the undistorted destination; sampling never moves the boundary.
  vec2 local = (vUv * uResolution - uPointer) / uSquareSize + 0.5;
  float cursorSquareMask = step(0.0, local.x) * step(local.x, 1.0)
    * step(0.0, local.y) * step(local.y, 1.0);
  float objectMask = boxMask(vUv);
  float finalMask = cursorSquareMask * objectMask;
  if (finalMask < 0.999 || boxInterior(vUv) < 0.5 || (uBlendAmount <= 0.0 && uDotOpacity <= 0.0)) discard;
  // Inverse normal-directed reprojection: only the treatment moves above the base.
  // A screen-space approximation to a thin lifted shell, measured in CSS pixels.
  vec2 effectUv = vUv;
  vec3 destinationNormal = normalize(texture2D(tMask, vUv).rgb * 2.0 - 1.0);
  for (int iteration = 0; iteration < 2; iteration++) {
    vec3 viewNormal = normalize(texture2D(tMask, effectUv).rgb * 2.0 - 1.0);
    vec2 candidate = vUv - viewNormal.xy * uSurfaceDistance * uPixelRatio / uResolution;
    if (boxInterior(candidate) < 0.5 || boxSurface(candidate, destinationNormal) < 0.5) break;
    effectUv = candidate;
  }
  // Reconstruct the visible surface in the subject root's own coordinates.
  // Cursor position affects only visibility, never the pattern or its sampling.
  float depth = texture2D(tDepth, effectUv).x;
  vec4 surfaceH = uClipToObject * vec4(effectUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 surface = surfaceH.xyz / surfaceH.w;
  vec3 p = (surface - uObjectMin) / uObjectSize;
  vec3 n = abs(normalize(cross(dFdx(surface), dFdy(surface))));
  // Box-aligned face coordinates: horizontal strips wrap onto the side and lid.
  vec3 horizontal = n.x > n.z && n.x > n.y ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  float surfaceX = dot(p, horizontal);
  float surfaceY = n.y > max(n.x, n.z) ? p.z : p.y;
  float y = clamp(surfaceY, 0.0, 0.9999);
  // Four separated horizontal regions: the selected width totals bandCoverage.
  // Hold each state, then briefly reassemble before selecting a fresh set.
  float state = floor(uTime);
  float phase = fract(uTime);
  float pulse = smoothstep(0.0, 0.1, phase) * (1.0 - smoothstep(0.78, 1.0, phase));
  float region = floor(y * 4.0);
  float seed = region * 17.0 + state * 31.0;
  float center = 0.2 + 0.6 * boxHash(seed + 1.0);
  float localY = fract(y * 4.0);
  float distance = abs(localY - center);
  float band = 1.0 - smoothstep(uBandCoverage * 0.43, uBandCoverage * 0.5, distance);
  float fragmentPhase = fract(surfaceX * 7.0 + boxHash(seed + 40.0));
  float stripFragment = smoothstep(0.02, 0.06, fragmentPhase)
    * (1.0 - smoothstep(0.68, 0.74, fragmentPhase));
  float activity = band * pulse * stripFragment;
  vec3 original = texture2D(tScene, vUv).rgb;
  vec3 effectBase = texture2D(tScene, effectUv).rgb;
  float litLuminance = dot(effectBase, vec3(0.2126, 0.7152, 0.0722));
  float shadow = 1.0 - smoothstep(0.12, 0.85, sqrt(max(litLuminance, 0.0)));
  // Isotropic subject-local triplanar projection; blends across curved transitions.
  float extent = max(max(uObjectSize.x, uObjectSize.y), uObjectSize.z);
  vec3 hatchPosition = (surface - uObjectMin) / max(extent, 0.0001);
  vec3 weights = pow(n, vec3(4.0));
  weights /= max(dot(weights, vec3(1.0)), 0.0001);
  float hatch = printCross(hatchPosition.yz, shadow) * weights.x
    + printCross(hatchPosition.xz, shadow) * weights.y
    + printCross(hatchPosition.xy, shadow) * weights.z;
  float direction = boxHash(seed + 2.0) * 2.0 - 1.0;
  float strong = step(0.86, boxHash(state + 97.0));
  float row = floor(surfaceY * 150.0);
  float tear = step(0.76, boxHash(row + state)) * strong * uTearAmount;
  // Controls use nominal surface pixels (300 across a face), independent of zoom.
  float shift = (direction * uBandOffsetStrength + tear * direction * 36.0) * pulse / 300.0;
  float stretch = step(0.78, boxHash(seed + 8.0)) * 0.65 * pulse;
  float x = mix(surfaceX + shift, 0.5 + (surfaceX + shift - 0.5) * 0.22, stretch);
  float brokenRow = step(0.55, boxHash(row + state * 71.0));
  float split = uRgbSplitAmount * (0.25 + 2.0 * brokenRow + tear) * pulse / 300.0;
  // Occasionally repeat a neighboring source fragment along the face direction.
  float duplicate = step(0.87, boxHash(seed + floor(surfaceX * 7.0) * 23.0 + 80.0));
  x -= duplicate * direction * 0.045 * pulse;
  vec3 samplePosition = surface + horizontal * uObjectSize * (x - surfaceX);
  vec3 splitVector = horizontal * uObjectSize * split;
  vec3 effect = vec3(boxRead(boxProject(samplePosition + splitVector), effectBase).r,
    boxRead(boxProject(samplePosition), effectBase).g,
    boxRead(boxProject(samplePosition - splitVector), effectBase).b);
  float scanPhase = surfaceY * 300.0;
  float scan = (0.5 + 0.5 * cos(scanPhase * 3.14159265))
    * (1.0 - smoothstep(0.5, 2.0, fwidth(scanPhase)));
  // Scanner is its own readable layer. It remains visible between corruption bursts.
  float scannerSweepY = fract(uTime * uScannerSpeed);
  float sweepDistance = abs(surfaceY - scannerSweepY);
  sweepDistance = min(sweepDistance, 1.0 - sweepDistance);
  float sweep = exp(-sweepDistance * sweepDistance * 1800.0) * uScannerSweepStrength;
  vec3 scanLayer = effectBase * (1.0 - uScanlineStrength * scan)
    + effectBase * sweep;

  // Short colored fragments sit beside damaged fragments instead of replacing the scanner.
  // Each surface row has its own clock, phase, travel and direction.
  // Advect the fragment coordinates so the same colored fragment visibly travels.
  // No global state reseed: it must not merely blink in a different place each second.
  float rowSeed = row * 13.0 + 311.0;
  float rowSpeed = 0.55 + boxHash(rowSeed + 1.0) * 1.1;
  float rowPhase = boxHash(rowSeed + 2.0) * 6.2831853;
  float rowDirection = boxHash(rowSeed + 3.0) < 0.5 ? -1.0 : 1.0;
  float moving = step(1.0 - uColorMovingDensity, boxHash(rowSeed + 4.0));
  float travel = moving * uColorMotionTravel / 300.0 * (0.5 + boxHash(rowSeed + 5.0) * 0.5);
  float motion = sin(uTime * uColorMotionSpeed * rowSpeed + rowPhase) * travel * rowDirection;
  float fragmentCoordinate = (surfaceX - motion) * 6.0;
  float fragmentId = floor(fragmentCoordinate);
  float colorSeed = rowSeed + fragmentId * 43.0;
  float fragmentX = fract(fragmentCoordinate);
  float fragmentWindow = step(0.14, fragmentX) * step(fragmentX, 0.72);
  float rowSelected = step(1.0 - uBandCoverage, boxHash(rowSeed + 6.0));
  float rowClock = fract(uTime * (0.3 + boxHash(rowSeed + 7.0) * 0.4) + boxHash(rowSeed + 8.0));
  float rowPulse = smoothstep(0.0, 0.12, rowClock) * (1.0 - smoothstep(0.8, 1.0, rowClock));
  float colored = step(1.0 - uColorDensity, boxHash(colorSeed))
    * fragmentWindow * rowSelected * rowPulse;
  float hue = boxHash(colorSeed + 19.0);
  vec3 accent = hue < 0.46 ? vec3(0.03, 0.65, 0.75)
    : hue < 0.92 ? vec3(0.75, 0.04, 0.45) : vec3(0.10, 0.62, 0.18);
  float sourceLight = dot(effect, vec3(0.2126, 0.7152, 0.0722));
  vec3 colorLayer = accent * (0.22 + sourceLight * 0.48) * colored * uColorStrength;
  // Rare missing strips stay opaque, so they never reveal background geometry.
  float missing = step(0.94, boxHash(seed + 21.0));
  effect *= 1.0 - missing * 0.96;
  float grain = boxHash(floor(surfaceX * 300.0) + row * 157.0 + state * 919.0) - 0.5;
  effect = max(vec3(0.0), effect + grain * uNoiseAmount);
  // Assemble all treatments first, then apply ONE global opacity to the full result.
  // Even colored accents obey the original/effect ratio; output remains opaque.
  vec3 treated = mix(scanLayer, effect, activity);
  treated *= 1.0 - hatch * uHatchStrength;
  treated += colorLayer;
  if (uLedEnabled) {
    vec3 led = ledTriplet(hatchPosition.z) * weights.x
      + ledTriplet(hatchPosition.x) * (weights.y + weights.z);
    treated = mix(treated, treated * led, uLedStrength);
  }
  vec3 layered = mix(original, treated, uBlendAmount);
  if (uDotOpacity > 0.0) layered = mix(layered, texture2D(tDots, effectUv).rgb, uDotOpacity);
  gl_FragColor = vec4(mix(original, layered, finalMask), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function createBoxCorruption(renderer: THREE.WebGLRenderer) {
  const params = { ...DEFAULT_CORRUPTION }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  const createTarget = (name: string, filter: THREE.TextureFilter) => {
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.UnsignedByteType, colorSpace: THREE.LinearSRGBColorSpace,
      minFilter: filter as THREE.MinificationTextureFilter, magFilter: THREE.NearestFilter,
      depthBuffer: true, samples: 0,
    })
    target.texture.name = name
    return target
  }
  const colorTarget = createTarget('BoxCorruption.original', THREE.LinearFilter)
  colorTarget.texture.magFilter = THREE.LinearFilter
  const maskTarget = createTarget('BoxCorruption.visibleMask', THREE.NearestFilter)
  maskTarget.depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType)
  const uniforms: Record<string, THREE.IUniform> = {
    tScene: { value: colorTarget.texture }, tMask: { value: maskTarget.texture },
    tDepth: { value: maskTarget.depthTexture },
    tDots: { value: colorTarget.texture }, uDotOpacity: { value: 0 },
    uClipToObject: { value: new THREE.Matrix4() }, uObjectToClip: { value: new THREE.Matrix4() },
    uObjectMin: { value: new THREE.Vector3() }, uObjectSize: { value: new THREE.Vector3(1, 1, 1) },
    uResolution: { value: size }, uPointer: { value: new THREE.Vector2() },
    uSquareSize: { value: new THREE.Vector2(300, 300) },
    uPixelRatio: { value: renderer.getPixelRatio() }, uTime: { value: 0 },
  }
  const keys = ['surfaceDistance', 'ledEnabled', 'ledStrength', 'ledPixelSize', 'ledGap', 'ledBlur', 'ledRgbMode', 'hatchStrength', 'hatchDensity', 'hatchWidth', 'scanlineStrength', 'scannerSweepStrength', 'scannerSpeed',
    'bandCoverage', 'bandOffsetStrength', 'tearAmount',
    'rgbSplitAmount', 'noiseAmount', 'blendAmount', 'colorStrength', 'colorDensity',
    'colorMotionSpeed', 'colorMotionTravel', 'colorMovingDensity'] as const
  for (const key of keys) uniforms['u' + key[0].toUpperCase() + key.slice(1)] = { value: params[key] }
  const material = new THREE.ShaderMaterial({
    name: 'Rigid box surface corruption', uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  })
  const quad = new FullScreenQuad(material)
  let subject: THREE.Object3D | null = null
  const members = new Set<THREE.Object3D>()
  const masks = new Map<THREE.Material, Map<boolean, THREE.MeshBasicMaterial>>()
  const clearMasks = () => { masks.forEach(pair => pair.forEach(m => m.dispose())); masks.clear() }
  const setSubject = (root: THREE.Object3D) => {
    clearMasks(); subject = root; members.clear()
    root.updateWorldMatrix(true, true)
    const rootInverse = root.matrixWorld.clone().invert()
    const bounds = new THREE.Box3()
    root.traverse(object => {
      members.add(object)
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.computeBoundingBox()
      if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone()
        .applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld)))
    })
    if (!bounds.isEmpty()) {
      uniforms.uObjectMin.value.copy(bounds.min)
      bounds.getSize(uniforms.uObjectSize.value).max(new THREE.Vector3(0.0001, 0.0001, 0.0001))
    }
  }
  const maskMaterial = (source: THREE.Material, isSubject: boolean) => {
    let pair = masks.get(source)
    if (!pair) { pair = new Map(); masks.set(source, pair) }
    let mask = pair.get(isSubject)
    if (!mask) {
      const surface = source as THREE.MeshStandardMaterial
      mask = new THREE.MeshBasicMaterial({
        map: surface.map ?? null, alphaMap: surface.alphaMap ?? null,
        alphaTest: source.alphaTest, side: source.side, depthTest: source.depthTest,
        depthWrite: source.depthWrite, visible: source.visible,
        clippingPlanes: source.clippingPlanes, clipIntersection: source.clipIntersection,
        fog: false, toneMapped: false, blending: THREE.NoBlending,
      })
      // Keep alpha cutouts and depth occlusion. RGB stores geometric face normals;
      // alpha identifies the subject. Normal discontinuities protect rigid creases.
      mask.onBeforeCompile = shader => {
        // Namespace Three's common helper for stricter GLSL compilers.
        shader.vertexShader = '#define average boxMaskAverage\nvarying vec3 vBoxViewPosition;\n' + shader.vertexShader.replace(
          '#include <project_vertex>', '#include <project_vertex>\nvBoxViewPosition = mvPosition.xyz;')
        shader.fragmentShader = '#define average boxMaskAverage\nvarying vec3 vBoxViewPosition;\n' + shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          'outgoingLight = normalize(cross(dFdx(vBoxViewPosition), dFdy(vBoxViewPosition))) * 0.5 + 0.5;\n'
          + '#include <opaque_fragment>\ngl_FragColor.a = ' + (isSubject ? '1.0;' : '0.0;'))
      }
      mask.customProgramCacheKey = () => 'box-mask-' + isSubject
      pair.set(isSubject, mask)
    }
    return mask
  }
  const resize = () => {
    renderer.getDrawingBufferSize(size)
    colorTarget.setSize(Math.max(1, size.x), Math.max(1, size.y))
    maskTarget.setSize(Math.max(1, size.x), Math.max(1, size.y))
    uniforms.uPixelRatio.value = renderer.getPixelRatio()
  }
  const pointer = new THREE.Vector2()
  let pointerActive = false
  const setPointer = (x: number, y: number) => { pointer.set(x, y); pointerActive = true }
  const clearPointer = () => { pointerActive = false }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let signalTime = 0.35
  let lastTime: number | undefined
  const render = (scene: THREE.Scene, camera: THREE.Camera, elapsed: number) => {
    const dt = lastTime === undefined ? 0 : Math.max(0, Math.min(elapsed - lastTime, 0.1))
    lastTime = elapsed
    if (!reducedMotion.matches) signalTime += dt * params.animationSpeed
    // Direct rendering retains the original antialiased outline and background.
    renderer.render(scene, camera)
    if (!params.enabled || (params.blendAmount <= 0 && uniforms.uDotOpacity.value <= 0) || !subject || !pointerActive) return
    subject.updateWorldMatrix(true, false)
    uniforms.uObjectToClip.value.copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse).multiply(subject.matrixWorld)
    uniforms.uClipToObject.value.copy(uniforms.uObjectToClip.value).invert()
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const sx = size.x / rect.width, sy = size.y / rect.height
    uniforms.uPointer.value.set((pointer.x - rect.left) * sx, (rect.bottom ?? rect.top + rect.height) * sy - pointer.y * sy)
    uniforms.uSquareSize.value.set(params.squareSize * sx, params.squareSize * sy)
    uniforms.uTime.value = reducedMotion.matches ? 0.35 : signalTime
    for (const key of keys) uniforms['u' + key[0].toUpperCase() + key.slice(1)].value = params[key]
    const previousTarget = renderer.getRenderTarget()
    const autoClear = renderer.autoClear
    const scissorTest = renderer.getScissorTest()
    const scissor = renderer.getScissor(new THREE.Vector4())
    const clearColor = renderer.getClearColor(new THREE.Color())
    const clearAlpha = renderer.getClearAlpha()
    const background = scene.background
    const override = scene.overrideMaterial
    const shadowUpdate = renderer.shadowMap.autoUpdate
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
    try {
      renderer.autoClear = true
      renderer.setScissorTest(false)
      renderer.setRenderTarget(colorTarget)
      renderer.render(scene, camera)
      renderer.shadowMap.autoUpdate = false
      scene.overrideMaterial = null
      scene.background = null
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return
        swapped.push([object, object.material])
        const convert = (source: THREE.Material) => maskMaterial(source, members.has(object))
        object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material)
      })
      renderer.setClearColor(0x000000, 0)
      renderer.setRenderTarget(maskTarget)
      renderer.render(scene, camera)
      renderer.setRenderTarget(previousTarget)
      renderer.autoClear = false
      renderer.setScissor(scissor)
      renderer.setScissorTest(scissorTest)
      quad.render(renderer)
    } finally {
      for (const [mesh, original] of swapped) mesh.material = original
      scene.background = background
      scene.overrideMaterial = override
      renderer.shadowMap.autoUpdate = shadowUpdate
      renderer.setClearColor(clearColor, clearAlpha)
      renderer.setRenderTarget(previousTarget)
      renderer.autoClear = autoClear
      renderer.setScissor(scissor)
      renderer.setScissorTest(scissorTest)
    }
  }
  const setDots = (texture: THREE.Texture, opacity: number) => {
    uniforms.tDots.value = texture
    uniforms.uDotOpacity.value = THREE.MathUtils.clamp(opacity, 0, 1)
  }
  return { params, setDots, setPointer, clearPointer, setSubject, resize, render, dispose: () => {
    clearMasks(); colorTarget.dispose(); maskTarget.dispose(); material.dispose(); quad.dispose()
  } }
}
