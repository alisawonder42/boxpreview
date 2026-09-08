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
  shadowThreshold: number
  highlightThreshold: number
  baseDarken: number
  effectIntensity: number
  borderOpacity: number
  surfaceRoughness: number
  animSpeed: number
}

export const DEFAULT_LENS: LensParams = {
  enabled: true,
  lensSize: 300,
  cellSize: 4.5,
  pointSize: 1.35,
  pointDensity: 0.9,
  flicker: 0.22,
  edgeBoost: 1.25,
  glitchAmount: 0.32,
  glitchFrequency: 0.55,
  glitchShift: 14,
  scanlines: 0.28,
  shadowGreen: '#062f24',
  midGreen: '#1bd671',
  highlightGreen: '#c6ffe3',
  shadowThreshold: 0.28,
  highlightThreshold: 0.72,
  baseDarken: 0.42,
  effectIntensity: 1.15,
  borderOpacity: 0.42,
  surfaceRoughness: 0.34,
  animSpeed: 0.75,
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D tScan;
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
uniform float uShadowThreshold;
uniform float uHighlightThreshold;
uniform float uBaseDarken;
uniform float uEffectIntensity;
uniform float uBorderOpacity;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 scanPalette(float value) {
  float lowRange = max(uShadowThreshold, 0.001);
  float highRange = max(1.0 - uHighlightThreshold, 0.001);
  float toMid = smoothstep(0.0, lowRange, value);
  float toHighlight = smoothstep(uHighlightThreshold, uHighlightThreshold + highRange, value);
  return mix(mix(uShadowGreen, uMidGreen, toMid), uHighlightGreen, toHighlight);
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  float halfLens = uLensSize * 0.5;
  vec2 squareDelta = abs(pixel - uPointer);
  float squareDistance = max(squareDelta.x, squareDelta.y);
  float inside = (1.0 - smoothstep(halfLens - 0.8, halfLens + 0.8, squareDistance)) * uActive;

  if (inside <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float cellSize = max(uCellSize, 2.0);
  vec2 cellId = floor(pixel / cellSize);
  vec2 cellCenter = (cellId + 0.5) * cellSize;
  vec2 localPx = pixel - cellCenter;

  float timeStep = floor(uTime * max(uGlitchFrequency, 0.01) * 12.0);
  float rowId = floor(pixel.y / max(cellSize * 0.62, 1.0));
  float rowNoise = hash21(vec2(rowId, timeStep + 19.0));
  float glitchBand = step(1.0 - clamp(uGlitchAmount, 0.0, 1.0) * 0.24, rowNoise);
  float glitchDirection = hash21(vec2(rowId + 7.0, timeStep + 3.0)) - 0.5;
  float horizontalShift = glitchDirection * uGlitchShift * glitchBand;

  vec2 samplePixel = cellCenter + vec2(horizontalShift, 0.0);
  vec2 sampleUv = clamp(samplePixel / uResolution, vec2(0.001), vec2(0.999));
  vec4 scanSample = texture2D(tScan, sampleUv);
  float subjectMask = smoothstep(0.03, 0.28, scanSample.a);

  vec2 onePixel = 1.0 / uResolution;
  float maskL = texture2D(tScan, clamp(sampleUv - vec2(onePixel.x * 2.0, 0.0), vec2(0.001), vec2(0.999))).a;
  float maskR = texture2D(tScan, clamp(sampleUv + vec2(onePixel.x * 2.0, 0.0), vec2(0.001), vec2(0.999))).a;
  float maskD = texture2D(tScan, clamp(sampleUv - vec2(0.0, onePixel.y * 2.0), vec2(0.001), vec2(0.999))).a;
  float maskU = texture2D(tScan, clamp(sampleUv + vec2(0.0, onePixel.y * 2.0), vec2(0.001), vec2(0.999))).a;
  float silhouetteEdge = clamp(abs(maskR - maskL) + abs(maskU - maskD), 0.0, 1.0);

  float centerLum = luminance(scanSample.rgb);
  float lumL = luminance(texture2D(tScan, clamp(sampleUv - vec2(onePixel.x * 2.5, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lumR = luminance(texture2D(tScan, clamp(sampleUv + vec2(onePixel.x * 2.5, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lumD = luminance(texture2D(tScan, clamp(sampleUv - vec2(0.0, onePixel.y * 2.5), vec2(0.001), vec2(0.999))).rgb);
  float lumU = luminance(texture2D(tScan, clamp(sampleUv + vec2(0.0, onePixel.y * 2.5), vec2(0.001), vec2(0.999))).rgb);
  float detailEdge = clamp((abs(lumR - lumL) + abs(lumU - lumD)) * 2.8, 0.0, 1.0);
  float edge = clamp((silhouetteEdge + detailEdge) * uEdgeBoost, 0.0, 1.0);

  float shapedLum = clamp(centerLum * 1.38 + edge * 0.36, 0.0, 1.0);
  vec3 palette = scanPalette(shapedLum);

  float seed = hash21(cellId + vec2(13.1, 71.7));
  float density = clamp(uPointDensity + shapedLum * 0.06 + edge * 0.12, 0.0, 1.0);
  float keepPoint = step(seed, density);

  float pointRadius = clamp(uPointSize, 0.35, cellSize * 0.48);
  float pointDistance = length(localPx);
  float pointAA = max(fwidth(pointDistance), 0.7);
  float pointShape = 1.0 - smoothstep(pointRadius, pointRadius + pointAA, pointDistance);

  float flickerSeed = hash21(cellId * 1.37 + vec2(floor(uTime * 10.0), floor(uTime * 6.0) + 33.0));
  float flicker = mix(1.0 - uFlicker * 0.35, 1.0 + uFlicker, flickerSeed);

  float rareSeed = hash21(cellId + vec2(211.7, 43.2));
  float twinkle = 0.5 + 0.5 * sin(uTime * 7.0 + rareSeed * 31.4159);
  float sparkle = smoothstep(0.975, 1.0, rareSeed) * twinkle;

  float fineLine = 0.5 + 0.5 * sin(pixel.y * 3.14159265);
  float scanlineShade = mix(1.0, mix(0.72, 1.05, fineLine), uScanlines);

  float brokenSegment = step(0.55, hash21(vec2(floor(pixel.x / 28.0), rowId + timeStep * 3.0)));
  float rowCell = mod(pixel.y, max(cellSize * 0.62, 1.0));
  float streakShape = 1.0 - smoothstep(0.25, 1.25, abs(rowCell - 0.5));
  float streak = glitchBand * brokenSegment * streakShape;

  vec3 pointColor = palette * (0.5 + shapedLum * 1.15 + edge * 0.55) * flicker * scanlineShade;
  pointColor += uHighlightGreen * sparkle * (0.75 + shapedLum) * 1.8;

  float luminousPoints = pointShape * keepPoint * subjectMask;
  float pointAlpha = clamp(luminousPoints * (0.55 + uEffectIntensity * 0.35), 0.0, 0.96);
  float textureAlpha = subjectMask * shapedLum * 0.08 * uEffectIntensity;
  float streakAlpha = streak * subjectMask * uGlitchAmount * 0.5;

  float windowAlpha = inside * uBaseDarken * 0.34;
  vec3 windowColor = uShadowGreen * (0.55 + subjectMask * 0.18);

  float borderDistance = abs(squareDistance - halfLens);
  float border = (1.0 - smoothstep(0.5, 1.8, borderDistance)) * uActive;
  float borderAlpha = border * uBorderOpacity;

  vec3 overlayColor = windowColor;
  float overlayAlpha = windowAlpha;

  float pointMix = pointAlpha * inside;
  overlayColor = mix(overlayColor, pointColor, pointMix);
  overlayAlpha = max(overlayAlpha, pointMix);

  float micro = hash21(pixel + floor(uTime * 18.0));
  float microAlpha = textureAlpha * micro * inside;
  overlayColor = mix(overlayColor, palette, microAlpha);
  overlayAlpha = max(overlayAlpha, microAlpha);

  float glitchMix = streakAlpha * inside;
  overlayColor = mix(overlayColor, uHighlightGreen, glitchMix);
  overlayAlpha = max(overlayAlpha, glitchMix);

  overlayColor = mix(overlayColor, uHighlightGreen, borderAlpha);
  overlayAlpha = max(overlayAlpha, borderAlpha);

  gl_FragColor = vec4(overlayColor, clamp(overlayAlpha, 0.0, 0.98));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function createTechnicalLens(renderer: THREE.WebGLRenderer) {
  const params: LensParams = { ...DEFAULT_LENS }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())

  const scanTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
  })
  scanTarget.texture.name = 'ScanLens.subject'

  const pointerCss = new THREE.Vector2(-1, -1)
  const subjectMeshes = new Set<THREE.Mesh>()
  const materialCache = new Map<THREE.Material, THREE.MeshPhysicalMaterial>()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let pointerActive = false

  const scanMaterialFor = (source: THREE.Material) => {
    const cached = materialCache.get(source)
    if (cached) return cached

    const original = source as THREE.MeshStandardMaterial
    const material = new THREE.MeshPhysicalMaterial({
      color: '#36e69a',
      map: original.map ?? null,
      metalness: 0.68,
      roughness: params.surfaceRoughness,
      envMapIntensity: 2.1,
      emissive: new THREE.Color('#062f24'),
      emissiveIntensity: 0.18,
      clearcoat: 0.14,
      clearcoatRoughness: 0.32,
      normalMap: original.normalMap ?? null,
      bumpMap: original.bumpMap ?? null,
      bumpScale: original.bumpScale ?? 1,
      aoMap: original.aoMap ?? null,
      aoMapIntensity: original.aoMapIntensity ?? 1,
      alphaMap: original.alphaMap ?? null,
      alphaTest: source.alphaTest,
      transparent: source.transparent,
      opacity: source.opacity,
      side: source.side,
      displacementMap: original.displacementMap ?? null,
      displacementScale: original.displacementScale ?? 1,
      displacementBias: original.displacementBias ?? 0,
    })
    if (original.normalScale) material.normalScale.copy(original.normalScale)
    if (original.normalMapType !== undefined) material.normalMapType = original.normalMapType
    material.name = 'Green scan surface'
    materialCache.set(source, material)
    return material
  }

  const uniforms = {
    tScan: { value: scanTarget.texture },
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
    uShadowThreshold: { value: params.shadowThreshold },
    uHighlightThreshold: { value: params.highlightThreshold },
    uBaseDarken: { value: params.baseDarken },
    uEffectIntensity: { value: params.effectIntensity },
    uBorderOpacity: { value: params.borderOpacity },
  }

  const compositeMaterial = new THREE.ShaderMaterial({
    name: 'Green scan lens overlay',
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  })
  const quad = new FullScreenQuad(compositeMaterial)

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
    uniforms.uPointer.value.set(pointerCss.x * sx, (rect.height - pointerCss.y) * sy)
  }

  const resize = () => {
    renderer.getDrawingBufferSize(size)
    const width = Math.max(1, Math.floor(size.x))
    const height = Math.max(1, Math.floor(size.y))
    scanTarget.setSize(width, height)
    syncSize()
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
    subjectMeshes.clear()
    subject.traverse((object) => {
      if (object instanceof THREE.Mesh) subjectMeshes.add(object)
    })
  }

  const syncUniforms = (elapsed: number) => {
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
    uniforms.uShadowThreshold.value = params.shadowThreshold
    uniforms.uHighlightThreshold.value = params.highlightThreshold
    uniforms.uBaseDarken.value = params.baseDarken
    uniforms.uEffectIntensity.value = params.effectIntensity
    uniforms.uBorderOpacity.value = params.borderOpacity
    for (const material of materialCache.values()) material.roughness = params.surfaceRoughness
    syncSize()
  }

  const render = (scene: THREE.Scene, camera: THREE.Camera, elapsed: number) => {
    const active = pointerActive && params.enabled

    renderer.setRenderTarget(null)
    renderer.render(scene, camera)

    if (!active || subjectMeshes.size === 0) return

    syncUniforms(elapsed)
    uniforms.uActive.value = 1

    const previousTarget = renderer.getRenderTarget()
    const previousBackground = scene.background
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate
    const previousClearAlpha = renderer.getClearAlpha()
    const previousClearColor = renderer.getClearColor(new THREE.Color()).clone()
    const previousAutoClear = renderer.autoClear
    const hiddenMeshes: Array<[THREE.Mesh, boolean]> = []
    const swappedMaterials: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = []

    try {
      renderer.shadowMap.autoUpdate = false
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        if (subjectMeshes.has(object)) {
          const original = object.material
          swappedMaterials.push([object, original])
          object.material = Array.isArray(original) ? original.map(scanMaterialFor) : scanMaterialFor(original)
        } else {
          hiddenMeshes.push([object, object.visible])
          object.visible = false
        }
      })

      scene.background = null
      renderer.setClearColor(0x000000, 0)
      renderer.setRenderTarget(scanTarget)
      renderer.clear(true, true, true)
      renderer.render(scene, camera)
    } finally {
      for (const [mesh, material] of swappedMaterials) mesh.material = material
      for (const [mesh, visible] of hiddenMeshes) mesh.visible = visible
      scene.background = previousBackground
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate
      renderer.setClearColor(previousClearColor, previousClearAlpha)
      renderer.setRenderTarget(previousTarget)
    }

    renderer.setRenderTarget(null)
    renderer.autoClear = false
    try {
      quad.render(renderer)
    } finally {
      renderer.autoClear = previousAutoClear
    }
  }

  const dispose = () => {
    scanTarget.dispose()
    for (const material of materialCache.values()) material.dispose()
    materialCache.clear()
    compositeMaterial.dispose()
    quad.dispose()
  }

  resize()
  return { params, render, setPointer, setPointerActive, setSubject, resize, dispose }
}
