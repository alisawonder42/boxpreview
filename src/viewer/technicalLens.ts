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
uniform float uShadowThreshold;
uniform float uHighlightThreshold;
uniform float uBaseDarken;
uniform float uEffectIntensity;
uniform float uBorderOpacity;
uniform float uSurfaceRoughness;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

vec3 scanPalette(float value) {
  float shadowEnd = max(uShadowThreshold, 0.001);
  float highlightStart = max(uHighlightThreshold, shadowEnd + 0.01);
  float shadowMix = smoothstep(0.0, shadowEnd, value);
  vec3 low = mix(uShadowGreen, uMidGreen, shadowMix);
  float highlightMix = smoothstep(highlightStart, 1.0, value);
  return mix(low, uHighlightGreen, highlightMix);
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec3 sceneColor = texture2D(tScene, vUv).rgb;

  float halfLens = uLensSize * 0.5;
  vec2 lensDelta = abs(pixel - uPointer);
  float squareDistance = max(lensDelta.x, lensDelta.y);
  float inside = (1.0 - smoothstep(halfLens - 0.8, halfLens + 0.8, squareDistance)) * uActive;

  float cellSize = max(uCellSize, 2.0);
  vec2 cellId = floor(pixel / cellSize);
  vec2 cellCenter = (cellId + 0.5) * cellSize;
  vec2 localPx = pixel - cellCenter;
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
  float baseLum = luminance(subjectSample.rgb);

  vec2 texel = 1.0 / uResolution;
  float lumL = luminance(texture2D(tSubject, clamp(cellUv - vec2(texel.x * 2.0, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lumR = luminance(texture2D(tSubject, clamp(cellUv + vec2(texel.x * 2.0, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lumD = luminance(texture2D(tSubject, clamp(cellUv - vec2(0.0, texel.y * 2.0), vec2(0.001), vec2(0.999))).rgb);
  float lumU = luminance(texture2D(tSubject, clamp(cellUv + vec2(0.0, texel.y * 2.0), vec2(0.001), vec2(0.999))).rgb);
  float detailEdge = clamp((abs(lumR - lumL) + abs(lumU - lumD)) * 3.2 * uEdgeBoost, 0.0, 1.0);

  float contrast = mix(1.22, 1.55, 1.0 - clamp(uSurfaceRoughness, 0.0, 1.0));
  float shapedLum = clamp(baseLum * contrast + detailEdge * 0.34, 0.0, 1.0);
  vec3 palette = scanPalette(shapedLum);

  float densitySeed = hash21(cellId + vec2(13.7, 91.3));
  float density = clamp(uPointDensity + detailEdge * 0.08 + shapedLum * 0.04, 0.0, 1.0);
  float keepPoint = step(densitySeed, density);

  float radius = clamp(uPointSize, 0.35, cellSize * 0.48);
  float pointDistance = length(localPx);
  float pointShape = 1.0 - smoothstep(radius, radius + 0.9, pointDistance);

  float flickerSeed = hash21(cellId + vec2(floor(uTime * 9.0), floor(uTime * 5.0) + 41.0));
  float flicker = mix(1.0 - uFlicker * 0.28, 1.0 + uFlicker, flickerSeed);

  float sparkleSeed = hash21(cellId + vec2(241.0, 67.0));
  float sparklePulse = 0.5 + 0.5 * sin(uTime * 6.5 + sparkleSeed * 28.0);
  float sparkle = smoothstep(0.978, 1.0, sparkleSeed) * sparklePulse;

  float scanWave = 0.5 + 0.5 * sin(pixel.y * 3.14159265);
  float scanShade = mix(1.0, mix(0.76, 1.04, scanWave), uScanlines);

  vec3 pointColor = palette * (0.48 + shapedLum * 1.20 + detailEdge * 0.45) * flicker * scanShade;
  pointColor += uHighlightGreen * sparkle * (0.7 + shapedLum) * 1.65;

  float effectMask = inside * subjectMask;

  vec3 scanBase = mix(sceneColor, uShadowGreen * (0.10 + shapedLum * 0.16), clamp(uBaseDarken, 0.0, 1.0));
  float luminous = pointShape * keepPoint * subjectMask;
  scanBase += pointColor * luminous * uEffectIntensity;

  float microNoise = hash21(pixel + floor(uTime * 16.0));
  scanBase += palette * subjectMask * shapedLum * microNoise * 0.035 * uEffectIntensity;

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

export function createTechnicalLens(renderer: THREE.WebGLRenderer) {
  const params: LensParams = { ...DEFAULT_LENS }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())

  const makeTarget = () => new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 4,
  })

  const sceneTarget = makeTarget()
  const subjectTarget = makeTarget()
  sceneTarget.texture.name = 'ScanLens.scene'
  subjectTarget.texture.name = 'ScanLens.subject'

  const pointerCss = new THREE.Vector2(-1, -1)
  const subjectMeshes = new Set<THREE.Mesh>()
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
    uShadowThreshold: { value: params.shadowThreshold },
    uHighlightThreshold: { value: params.highlightThreshold },
    uBaseDarken: { value: params.baseDarken },
    uEffectIntensity: { value: params.effectIntensity },
    uBorderOpacity: { value: params.borderOpacity },
    uSurfaceRoughness: { value: params.surfaceRoughness },
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
    syncSize()
    const width = Math.max(1, Math.floor(size.x))
    const height = Math.max(1, Math.floor(size.y))
    sceneTarget.setSize(width, height)
    subjectTarget.setSize(width, height)
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
    uniforms.uShadowThreshold.value = params.shadowThreshold
    uniforms.uHighlightThreshold.value = params.highlightThreshold
    uniforms.uBaseDarken.value = params.baseDarken
    uniforms.uEffectIntensity.value = params.effectIntensity
    uniforms.uBorderOpacity.value = params.borderOpacity
    uniforms.uSurfaceRoughness.value = params.surfaceRoughness
    syncSize()
  }

  const render = (scene: THREE.Scene, camera: THREE.Camera, elapsed: number) => {
    const active = pointerActive && params.enabled
    if (!active || subjectMeshes.size === 0) {
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
      return
    }

    syncUniforms(elapsed)

    const previousTarget = renderer.getRenderTarget()
    const previousBackground = scene.background
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate
    const previousClearColor = renderer.getClearColor(new THREE.Color()).clone()
    const previousClearAlpha = renderer.getClearAlpha()
    const hiddenMeshes: Array<[THREE.Mesh, boolean]> = []

    try {
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
      renderer.setClearColor(0x000000, 0)
      renderer.setRenderTarget(subjectTarget)
      renderer.clear(true, true, true)
      renderer.render(scene, camera)
    } finally {
      for (const [mesh, visible] of hiddenMeshes) mesh.visible = visible
      scene.background = previousBackground
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate
      renderer.setClearColor(previousClearColor, previousClearAlpha)
      renderer.setRenderTarget(previousTarget)
    }

    quad.render(renderer)
  }

  const dispose = () => {
    sceneTarget.dispose()
    subjectTarget.dispose()
    compositeMaterial.dispose()
    quad.dispose()
  }

  resize()
  return { params, render, setPointer, setPointerActive, setSubject, resize, dispose }
}
