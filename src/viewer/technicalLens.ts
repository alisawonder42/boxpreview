import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export type LensParams = {
  enabled: boolean
  lensSize: number
  cellSize: number
  pointSize: number
  pointDensity: number
  flicker: number
  edgeBoost: number
  glitchAmount: number
  glitchFrequency: number
  glitchShift: number
  scanlines: number
  shadowGreen: string
  midGreen: string
  highlightGreen: string
  highlightGold: string
  highlightWhite: string
  shadowThreshold: number
  highlightThreshold: number
  baseDarken: number
  effectOpacity: number
  effectIntensity: number
  borderOpacity: number
  surfaceRoughness: number
  animSpeed: number
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  grainStrength: number
  rowFlowEnabled: boolean
  rowSpeed: number
  rowDirection: number
  symbols: string
  symbolDensity: number
  symbolSize: number
  symbolChangeSpeed: number
}

export const DEFAULT_LENS: LensParams = {
  enabled: false,
  lensSize: 300,
  cellSize: 4.4,
  pointSize: 1.4,
  pointDensity: 0.92,
  flicker: 0.64,
  edgeBoost: 1.39,
  glitchAmount: 0.28,
  glitchFrequency: 2,
  glitchShift: 27,
  scanlines: 0.77,
  shadowGreen: '#000000',
  midGreen: '#3f4c4b',
  highlightGreen: '#45b279',
  highlightGold: '#c3efe1',
  highlightWhite: '#d0ffed',
  shadowThreshold: 0.6,
  highlightThreshold: 0.82,
  baseDarken: 0.37,
  effectOpacity: 0.5,
  effectIntensity: 0.91,
  borderOpacity: 0.69,
  surfaceRoughness: 0.63,
  animSpeed: 2,
  bloomStrength: 0,
  bloomRadius: 5,
  bloomThreshold: 0.62,
  grainStrength: 0,
  rowFlowEnabled: false,
  rowSpeed: 3,
  rowDirection: 1,
  symbols: '1',
  symbolDensity: 0.4,
  symbolSize: 0.55,
  symbolChangeSpeed: 0.5,
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tSubject;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uLensSize;
uniform float uActive;
uniform float uTime;
uniform float uCellSize;
uniform float uPointSize;
uniform float uPointDensity;
uniform float uFlicker;
uniform float uEdgeBoost;
uniform float uGlitchAmount;
uniform float uGlitchFrequency;
uniform float uGlitchShift;
uniform float uScanlines;
uniform vec3 uShadowGreen;
uniform vec3 uMidGreen;
uniform vec3 uHighlightGreen;
uniform vec3 uHighlightGold;
uniform vec3 uHighlightWhite;
uniform float uShadowThreshold;
uniform float uHighlightThreshold;
uniform float uBaseDarken;
uniform float uEffectIntensity;
uniform float uBorderOpacity;
uniform float uSurfaceRoughness;
uniform float uRowSpeed;
uniform float uRowDirection;
uniform sampler2D tGlyphAtlas;
uniform float uGlyphCount;
uniform float uSymbolDensity;
uniform float uSymbolSize;
uniform float uSymbolChangeSpeed;
uniform float uRowTime;
uniform float uRowMotionEnabled;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Three.js injects luminance(vec3) into ShaderMaterial's fragment prefix.
// Keep our helper namespaced to avoid a duplicate GLSL function definition.
float scanSurfaceLight(vec4 surface) {
  vec3 n = normalize(surface.rgb * 2.0 - 1.0);
  float key = max(dot(n, normalize(vec3(-0.55, 0.65, 0.75))), 0.0);
  float fill = max(dot(n, normalize(vec3(0.7, -0.1, 0.5))), 0.0);
  float rim = pow(1.0 - abs(n.z), 2.0);
  return (0.08 + key * 0.55 + fill * 0.16 + rim * 0.22) * surface.a;
}

vec3 scanPalette(float value) {
  float shadowEnd = max(uShadowThreshold, 0.001);
  float highlightStart = max(uHighlightThreshold, shadowEnd + 0.01);
  float shadowMix = smoothstep(0.0, shadowEnd, value);
  vec3 low = mix(uShadowGreen, uMidGreen, shadowMix);
  float highlightPosition = clamp((value - highlightStart) / max(1.0 - highlightStart, 0.01), 0.0, 1.0);
  vec3 color = mix(low, uHighlightGreen, smoothstep(0.0, 0.35, highlightPosition));
  color = mix(color, uHighlightGold, smoothstep(0.35, 0.75, highlightPosition));
  return mix(color, uHighlightWhite, smoothstep(0.75, 1.0, highlightPosition));
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec3 sceneColor = texture2D(tScene, vUv).rgb;

  float halfLens = uLensSize * 0.5;
  vec2 lensDelta = abs(pixel - uPointer);
  float squareDistance = max(lensDelta.x, lensDelta.y);
  float inside = (1.0 - smoothstep(halfLens - 0.8, halfLens + 0.8, squareDistance)) * uActive;
  if (squareDistance > halfLens + 2.0) {
    gl_FragColor = vec4(sceneColor, 1.0);
    return;
  }

  float cellSize = max(uCellSize, 2.0);
  vec2 cellId = floor(pixel / cellSize);
  // The display grid never moves. Cycle the source row identities instead.
  vec2 localPx = pixel - (cellId + 0.5) * cellSize;
  float firstRow = ceil((uPointer.y - halfLens) / cellSize - 0.5);
  float lastRow = floor((uPointer.y + halfLens) / cellSize - 0.5);
  float rowCount = max(lastRow - firstRow + 1.0, 1.0);
  float rowStep = floor(uRowTime * uRowSpeed) * uRowMotionEnabled;
  // Texture Y points upward, so reading from the next higher row moves
  // its contents downward. Wrap the last row back to the top of the lens.
  cellId.y = firstRow + mod(cellId.y - firstRow + rowStep * uRowDirection, rowCount);
  vec2 cellCenter = (cellId + 0.5) * cellSize;
  vec2 cellUv = clamp(cellCenter / uResolution, vec2(0.001), vec2(0.999));

  vec4 subjectHere = texture2D(tSubject, vUv);
  float subjectMask = smoothstep(0.02, 0.35, subjectHere.a);

  float timeStep = floor(uTime * max(uGlitchFrequency, 0.01) * 10.0);
  float rowId = floor(pixel.y / max(cellSize * 0.72, 1.0));
  float rowRandom = hash21(vec2(rowId, timeStep + 17.0));
  float glitchBand = step(1.0 - clamp(uGlitchAmount, 0.0, 1.0) * 0.20, rowRandom);
  float glitchSign = hash21(vec2(rowId + 12.0, timeStep + 5.0)) - 0.5;
  float shiftPx = glitchSign * uGlitchShift * glitchBand;
  vec2 shiftedUv = clamp(cellUv + vec2(shiftPx / uResolution.x, 0.0), vec2(0.001), vec2(0.999));

  vec4 subjectSample = texture2D(tSubject, shiftedUv);
  float baseLum = scanSurfaceLight(subjectSample);

  vec2 texel = 1.0 / uResolution;
  vec4 normalL = texture2D(tSubject, cellUv - vec2(texel.x * 2.0, 0.0));
  vec4 normalR = texture2D(tSubject, cellUv + vec2(texel.x * 2.0, 0.0));
  vec4 normalD = texture2D(tSubject, cellUv - vec2(0.0, texel.y * 2.0));
  vec4 normalU = texture2D(tSubject, cellUv + vec2(0.0, texel.y * 2.0));
  float detailEdge = clamp((length(normalR - normalL) + length(normalU - normalD)) * 2.4 * uEdgeBoost, 0.0, 1.0);

  float contrast = mix(1.22, 1.55, 1.0 - clamp(uSurfaceRoughness, 0.0, 1.0));
  float shapedLum = clamp(baseLum * contrast + detailEdge * 0.34, 0.0, 1.0);
  vec3 palette = scanPalette(shapedLum);

  float densitySeed = hash21(cellId + vec2(13.7, 91.3));
  float density = clamp(uPointDensity, 0.0, 1.0);
  float keepPoint = 1.0 - step(density, densitySeed);

  float radius = clamp(uPointSize, 0.35, cellSize * 0.48);
  float pointDistance = length(localPx);
  float pointShape = 1.0 - smoothstep(radius, radius + 0.9, pointDistance);

  float symbolTick = floor(uTime * uSymbolChangeSpeed);
  float symbolSeed = hash21(cellId + vec2(531.7, 98.3) + symbolTick);
  float useSymbol = (1.0 - step(uSymbolDensity, symbolSeed)) * step(0.5, uGlyphCount);
  vec2 glyphUv = localPx / max(cellSize * uSymbolSize, 1.0) + 0.5;
  float glyphInside = step(0.0, glyphUv.x) * step(glyphUv.x, 1.0)
    * step(0.0, glyphUv.y) * step(glyphUv.y, 1.0);
  float glyphId = floor(hash21(cellId + vec2(82.7, 16.2) + symbolTick) * max(uGlyphCount, 1.0));
  vec2 atlasUv = vec2((glyphId + clamp(glyphUv.x, 0.001, 0.999)) / max(uGlyphCount, 1.0),
    clamp(glyphUv.y, 0.001, 0.999));
  float glyphShape = texture2D(tGlyphAtlas, atlasUv).a * glyphInside;
  pointShape = mix(pointShape, glyphShape, useSymbol);


  float flickerSeed = hash21(cellId + vec2(floor(uTime * 9.0), floor(uTime * 5.0) + 41.0));
  float flicker = mix(1.0 - uFlicker * 0.28, 1.0 + uFlicker, flickerSeed);

  float sparkleSeed = hash21(cellId + vec2(241.0, 67.0));
  float sparklePulse = 0.5 + 0.5 * sin(uTime * 6.5 + sparkleSeed * 28.0);
  float sparkle = smoothstep(0.978, 1.0, sparkleSeed) * sparklePulse;

  float scanWave = 0.5 + 0.5 * sin(pixel.y * 3.14159265);
  float scanShade = mix(1.0, mix(0.76, 1.04, scanWave), uScanlines);

  vec3 pointColor = palette * (0.48 + shapedLum * 1.20 + detailEdge * 0.45) * flicker * scanShade;
  pointColor += uHighlightWhite * sparkle * (0.7 + shapedLum) * 1.65;

  float effectMask = inside * subjectMask;

  // A continuous relief layer keeps fine creases visible between scan points.
  // No albedo contribution: printed colors cannot become fake surface detail.
  float surfaceLight = scanSurfaceLight(subjectHere);
  vec3 scanBase = scanPalette(surfaceLight) * (0.16 + surfaceLight * 0.3)
    * (1.0 - clamp(uBaseDarken, 0.0, 1.0) * 0.8);
  float luminous = pointShape * keepPoint * subjectMask;
  scanBase += pointColor * luminous * uEffectIntensity;


  float brokenSegment = step(0.62, hash21(vec2(floor(pixel.x / 30.0), rowId + timeStep * 2.0)));
  float rowPhase = mod(pixel.y, max(cellSize * 0.72, 1.0));
  float streakShape = 1.0 - smoothstep(0.15, 1.15, abs(rowPhase - 0.5));
  float streak = glitchBand * brokenSegment * streakShape * subjectMask;
  scanBase += uHighlightGreen * streak * uGlitchAmount * (0.16 + shapedLum * 0.55);

  vec3 color = mix(sceneColor, scanBase, effectMask);

  float borderDistance = abs(squareDistance - halfLens);
  float border = (1.0 - smoothstep(0.45, 1.65, borderDistance)) * uActive;
  color += uHighlightGreen * border * uBorderOpacity * 0.55;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const BLOOM_FRAGMENT = /* glsl */ `
uniform sampler2D tEffect;
uniform sampler2D tSubject;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uLensSize;
uniform float uBloomStrength;
uniform float uBloomRadius;
uniform float uBloomThreshold;
uniform float uGrainStrength;
uniform float uTime;
varying vec2 vUv;

vec3 scanBright(vec2 uv) {
  vec2 delta = abs(uv * uResolution - uPointer);
  float windowMask = 1.0 - smoothstep(uLensSize * 0.5 - 1.0, uLensSize * 0.5, max(delta.x, delta.y));
  vec3 color = texture2D(tEffect, uv).rgb;
  float brightness = max(color.r, max(color.g, color.b));
  return color * smoothstep(uBloomThreshold, 1.0, brightness)
    * texture2D(tSubject, uv).a * windowMask;
}

void main() {
  vec3 glow = scanBright(vUv) * 0.2;
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.785398163;
    vec2 offset = vec2(cos(angle), sin(angle)) * uBloomRadius / uResolution;
    glow += scanBright(vUv + offset * 0.45) * 0.065;
    glow += scanBright(vUv + offset) * 0.035;
  }
  vec2 delta = abs(gl_FragCoord.xy - uPointer);
  float windowMask = 1.0 - smoothstep(uLensSize * 0.5 - 1.0, uLensSize * 0.5, max(delta.x, delta.y));
  gl_FragColor = vec4(texture2D(tEffect, vUv).rgb + glow * uBloomStrength * windowMask, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // Display-space monochrome grain, after bloom and tone mapping.
  // uTime stops for reduced-motion preferences; the grain then stays static.
  float grain = fract(sin(dot(floor(gl_FragCoord.xy) + floor(uTime * 18.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  float grainMask = texture2D(tSubject, vUv).a * windowMask;
  gl_FragColor.rgb = clamp(gl_FragColor.rgb + grain * uGrainStrength * grainMask, 0.0, 1.0);
}
`

export function createTechnicalLens(renderer: THREE.WebGLRenderer) {
  const params: LensParams = { ...DEFAULT_LENS }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())

  const makeTarget = () => new THREE.WebGLRenderTarget(size.x, size.y, {
    // The scan only needs normalized color. Avoid float/MSAA framebuffer
    // combinations that are not renderable on some mobile and older GPUs.
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
  })

  const sceneTarget = makeTarget()
  const subjectTarget = makeTarget()
  const effectTarget = makeTarget()
  sceneTarget.texture.name = 'ScanLens.scene'
  subjectTarget.texture.name = 'ScanLens.subject'
  effectTarget.texture.name = 'ScanLens.effect'

  const pointerCss = new THREE.Vector2(-1, -1)
  const subjectMeshes = new Set<THREE.Mesh>()
  const normalMaterials = new Map<THREE.Material, THREE.MeshNormalMaterial>()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let pointerActive = false

  const uniforms = {
    tScene: { value: sceneTarget.texture },
    tSubject: { value: subjectTarget.texture },
    uResolution: { value: size.clone() },
    uPointer: { value: new THREE.Vector2(-1e6, -1e6) },
    uLensSize: { value: params.lensSize },
    uActive: { value: 0 },
    uTime: { value: 0 },
    uCellSize: { value: params.cellSize },
    uPointSize: { value: params.pointSize },
    uPointDensity: { value: params.pointDensity },
    uFlicker: { value: params.flicker },
    uEdgeBoost: { value: params.edgeBoost },
    uGlitchAmount: { value: params.glitchAmount },
    uGlitchFrequency: { value: params.glitchFrequency },
    uGlitchShift: { value: params.glitchShift },
    uScanlines: { value: params.scanlines },
    uShadowGreen: { value: new THREE.Color(params.shadowGreen) },
    uMidGreen: { value: new THREE.Color(params.midGreen) },
    uHighlightGreen: { value: new THREE.Color(params.highlightGreen) },
    uHighlightGold: { value: new THREE.Color(params.highlightGold) },
    uHighlightWhite: { value: new THREE.Color(params.highlightWhite) },
    uShadowThreshold: { value: params.shadowThreshold },
    uHighlightThreshold: { value: params.highlightThreshold },
    uBaseDarken: { value: params.baseDarken },
    uEffectIntensity: { value: params.effectIntensity },
    uBorderOpacity: { value: params.borderOpacity },
    uSurfaceRoughness: { value: params.surfaceRoughness },
    tEffect: { value: effectTarget.texture },
    uBloomStrength: { value: params.bloomStrength },
    uBloomRadius: { value: params.bloomRadius },
    uBloomThreshold: { value: params.bloomThreshold },
    uGrainStrength: { value: params.grainStrength },
    uRowDirection: { value: params.rowDirection },
    tGlyphAtlas: { value: new THREE.Texture() },
    uGlyphCount: { value: 0 },
    uSymbolDensity: { value: params.symbolDensity },
    uSymbolSize: { value: params.symbolSize },
    uSymbolChangeSpeed: { value: params.symbolChangeSpeed },
    uRowSpeed: { value: params.rowSpeed },
    uRowTime: { value: 0 },
    uRowMotionEnabled: { value: 1 },
  }

  let previousSymbols: string | undefined
  const updateGlyphAtlas = () => {
    const symbols = [...new Set(Array.from(params.symbols.replace(/\s/g, '')))].slice(0, 32)
    const key = symbols.join('')
    if (key === previousSymbols) return
    previousSymbols = key
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(symbols.length, 1) * 64
    canvas.height = 64
    const context = canvas.getContext('2d')
    if (!context) {
      uniforms.uGlyphCount.value = 0
      return
    }
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.font = 'bold 48px monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#ffffff'
    symbols.forEach((symbol, index) => context.fillText(symbol, index * 64 + 32, 32, 54))
    const atlas = new THREE.CanvasTexture(canvas)
    atlas.minFilter = THREE.LinearFilter
    atlas.magFilter = THREE.LinearFilter
    atlas.generateMipmaps = false
    uniforms.tGlyphAtlas.value.dispose()
    uniforms.tGlyphAtlas.value = atlas
    uniforms.uGlyphCount.value = symbols.length
  }

  const compositeMaterial = new THREE.ShaderMaterial({
    name: 'Green scan square composite',
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new FullScreenQuad(compositeMaterial)
  const bloomMaterial = new THREE.ShaderMaterial({
    name: 'Scan lens soft bloom', uniforms, vertexShader: VERTEX,
    fragmentShader: BLOOM_FRAGMENT, depthTest: false, depthWrite: false,
  })
  const bloomQuad = new FullScreenQuad(bloomMaterial)

  const syncSize = () => {
    renderer.getDrawingBufferSize(size)
    uniforms.uResolution.value.copy(size)
    const rect = renderer.domElement.getBoundingClientRect()
    const sx = size.x / Math.max(rect.width, 1)
    const sy = size.y / Math.max(rect.height, 1)
    uniforms.uLensSize.value = params.lensSize * sx
    uniforms.uCellSize.value = params.cellSize * sx
    uniforms.uPointSize.value = params.pointSize * sx
    uniforms.uGlitchShift.value = params.glitchShift * sx
    uniforms.uBloomRadius.value = params.bloomRadius * sx
    uniforms.uPointer.value.set(pointerCss.x * sx, (rect.height - pointerCss.y) * sy)
  }

  const resize = () => {
    syncSize()
    const width = Math.max(1, Math.floor(size.x))
    const height = Math.max(1, Math.floor(size.y))
    sceneTarget.setSize(width, height)
    subjectTarget.setSize(width, height)
    effectTarget.setSize(width, height)
  }

  const setPointer = (x: number, y: number) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointerCss.set(x - rect.left, y - rect.top)
    syncSize()
  }

  const setPointerActive = (active: boolean) => {
    pointerActive = active
  }

  const setSubject = (subject: THREE.Object3D) => {
    for (const material of normalMaterials.values()) material.dispose()
    normalMaterials.clear()
    subjectMeshes.clear()
    subject.traverse((object) => {
      if (object instanceof THREE.Mesh) subjectMeshes.add(object)
    })
  }

  const surfaceMaterial = (source: THREE.Material) => {
    let material = normalMaterials.get(source)
    if (material) return material
    const detail = source as THREE.MeshStandardMaterial
    material = new THREE.MeshNormalMaterial({
      side: source.side,
      normalMap: detail.normalMap ?? null,
      normalMapType: detail.normalMapType ?? THREE.TangentSpaceNormalMap,
      normalScale: detail.normalScale?.clone() ?? new THREE.Vector2(1, 1),
      bumpMap: detail.bumpMap ?? null,
      bumpScale: detail.bumpScale ?? 1,
      displacementMap: detail.displacementMap ?? null,
      displacementScale: detail.displacementScale ?? 1,
      displacementBias: detail.displacementBias ?? 0,
      flatShading: detail.flatShading ?? false,
      toneMapped: false,
    })
    normalMaterials.set(source, material)
    return material
  }

  const syncUniforms = (elapsed: number) => {
    uniforms.uActive.value = 1
    uniforms.uTime.value = reducedMotion.matches ? 0 : elapsed * params.animSpeed
    uniforms.uPointDensity.value = params.pointDensity
    uniforms.uFlicker.value = params.flicker
    uniforms.uEdgeBoost.value = params.edgeBoost
    uniforms.uGlitchAmount.value = params.glitchAmount
    uniforms.uGlitchFrequency.value = params.glitchFrequency
    uniforms.uScanlines.value = params.scanlines
    uniforms.uShadowGreen.value.set(params.shadowGreen)
    uniforms.uMidGreen.value.set(params.midGreen)
    uniforms.uHighlightGreen.value.set(params.highlightGreen)
    uniforms.uHighlightGold.value.set(params.highlightGold)
    uniforms.uHighlightWhite.value.set(params.highlightWhite)
    uniforms.uShadowThreshold.value = params.shadowThreshold
    uniforms.uHighlightThreshold.value = params.highlightThreshold
    uniforms.uBaseDarken.value = params.baseDarken
    uniforms.uEffectIntensity.value = params.effectIntensity
    uniforms.uBorderOpacity.value = params.borderOpacity
    uniforms.uSurfaceRoughness.value = params.surfaceRoughness
    uniforms.uBloomStrength.value = params.bloomStrength
    uniforms.uBloomThreshold.value = params.bloomThreshold
    uniforms.uGrainStrength.value = params.grainStrength
    uniforms.uRowDirection.value = params.rowDirection < 0 ? -1 : 1
    uniforms.uSymbolDensity.value = params.symbolDensity
    uniforms.uSymbolSize.value = params.symbolSize
    uniforms.uSymbolChangeSpeed.value = params.symbolChangeSpeed
    updateGlyphAtlas()
    uniforms.uRowSpeed.value = params.rowSpeed
    uniforms.uRowTime.value = elapsed
    uniforms.uRowMotionEnabled.value = reducedMotion.matches || !params.rowFlowEnabled ? 0 : 1
    syncSize()
  }

  const render = (scene: THREE.Scene, camera: THREE.Camera, elapsed: number, captureOnly = false) => {
    // Keep the base view independent of the lens's offscreen passes.
    const previousTarget = renderer.getRenderTarget()
    if (!captureOnly) renderer.render(scene, camera)
    const active = pointerActive && params.enabled
    if (!active || subjectMeshes.size === 0) {
      return
    }

    syncUniforms(elapsed)

    const previousAutoClear = renderer.autoClear
    const previousScissorTest = renderer.getScissorTest()
    const previousScissor = renderer.getScissor(new THREE.Vector4())
    const previousBackground = scene.background
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate
    const previousClearColor = renderer.getClearColor(new THREE.Color()).clone()
    const previousClearAlpha = renderer.getClearAlpha()
    const hiddenMeshes: Array<[THREE.Mesh, boolean]> = []
    const originalMaterials: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = []

    try {
      renderer.autoClear = true
      renderer.setScissorTest(false)
      renderer.setRenderTarget(sceneTarget)
      renderer.render(scene, camera)

      renderer.shadowMap.autoUpdate = false
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        if (subjectMeshes.has(object)) return
        hiddenMeshes.push([object, object.visible])
        object.visible = false
      })

      scene.background = null
      for (const mesh of subjectMeshes) {
        originalMaterials.push([mesh, mesh.material])
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map(surfaceMaterial) : surfaceMaterial(mesh.material)
      }
      renderer.setClearColor(0x000000, 0)
      renderer.setRenderTarget(subjectTarget)
      renderer.clear(true, true, true)
      renderer.render(scene, camera)
      renderer.setRenderTarget(effectTarget)
      quad.render(renderer)
    } finally {
      for (const [mesh, material] of originalMaterials) mesh.material = material
      for (const [mesh, visible] of hiddenMeshes) mesh.visible = visible
      scene.background = previousBackground
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate
      renderer.setClearColor(previousClearColor, previousClearAlpha)
      renderer.setRenderTarget(previousTarget)
      renderer.autoClear = previousAutoClear
      renderer.setScissor(previousScissor)
      renderer.setScissorTest(previousScissorTest)
    }

    if (captureOnly) return

    // Scissor uses renderer pixels (before pixel ratio); uniforms use drawing
    // buffer pixels. Never clear or overwrite the scene outside this rectangle,
    // even if the composite shader cannot compile on a particular driver.
    const pixelRatio = renderer.getPixelRatio()
    const halfLens = uniforms.uLensSize.value * 0.5 + 2
    const pointer = uniforms.uPointer.value
    const left = Math.max(0, Math.floor(pointer.x - halfLens))
    const bottom = Math.max(0, Math.floor(pointer.y - halfLens))
    const right = Math.min(size.x, Math.ceil(pointer.x + halfLens))
    const top = Math.min(size.y, Math.ceil(pointer.y + halfLens))
    if (right <= left || top <= bottom) return

    try {
      renderer.autoClear = false
      renderer.setScissor(left / pixelRatio, bottom / pixelRatio,
        (right - left) / pixelRatio, (top - bottom) / pixelRatio)
      renderer.setScissorTest(true)
      bloomQuad.render(renderer)
    } finally {
      renderer.autoClear = previousAutoClear
      renderer.setScissor(previousScissor)
      renderer.setScissorTest(previousScissorTest)
    }
  }

  const dispose = () => {
    uniforms.tGlyphAtlas.value.dispose()
    sceneTarget.dispose()
    subjectTarget.dispose()
    effectTarget.dispose()
    for (const material of normalMaterials.values()) material.dispose()
    normalMaterials.clear()
    compositeMaterial.dispose()
    quad.dispose()
    bloomMaterial.dispose()
    bloomQuad.dispose()
  }

  resize()
  const getWindow = () => {
    syncSize()
    return { center: uniforms.uPointer.value, size: uniforms.uLensSize.value,
      originalTexture: sceneTarget.texture, opacity: params.effectOpacity,
      active: pointerActive && params.enabled && subjectMeshes.size > 0 }
  }
  return { params, render, getLayerTexture: () => effectTarget.texture, setPointer, setPointerActive, setSubject, resize, dispose, getWindow }
}
