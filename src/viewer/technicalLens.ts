import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export type LensParams = {
  enabled: boolean
  lensSize: number
  cellSize: number
  depthEdge: number
  surfaceDensity: number
  backgroundDensity: number
  markBrightness: number
  vectorLength: number
  animSpeed: number
  pulseAmount: number
  glyphSpeed: number
  scanSpeed: number
  scanBoost: number
  scanDensityBoost: number
  cyan: string
  red: string
  white: string
  cyanPercent: number
  redPercent: number
  whitePercent: number
}

export const DEFAULT_LENS: LensParams = {
  enabled: true,
  lensSize: 240,
  cellSize: 10,
  depthEdge: 1.8,
  surfaceDensity: 0.32,
  backgroundDensity: 0.04,
  markBrightness: 1.05,
  vectorLength: 0.36,
  animSpeed: 0.8,
  pulseAmount: 0.2,
  glyphSpeed: 0.9,
  scanSpeed: 0.25,
  scanBoost: 0.35,
  scanDensityBoost: 0.16,
  cyan: '#36DDF5',
  red: '#FF3B61',
  white: '#DCEEFF',
  cyanPercent: 45,
  redPercent: 35,
  whitePercent: 20,
}

const NORMAL_SCALE = 0.6

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = /* glsl */ `
#include <common>
#include <packing>

uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uLensSize;
uniform float uCellSize;
uniform float uActive;
uniform float uEnabled;
uniform float uTime;
uniform float uDepthEdge;
uniform float uSurfaceDensity;
uniform float uBackgroundDensity;
uniform float uMarkBrightness;
uniform float uVectorLength;
uniform float uAnimSpeed;
uniform float uPulseAmount;
uniform float uGlyphSpeed;
uniform float uScanSpeed;
uniform float uScanBoost;
uniform float uScanDensityBoost;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec3 uCyan;
uniform vec3 uRed;
uniform vec3 uWhite;
uniform float uCyanPercent;
uniform float uRedPercent;
uniform float uWhitePercent;

varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

float stroke(float d, float width) {
  float aa = max(fwidth(d), 0.0015);
  return 1.0 - smoothstep(width, width + aa, d);
}

float orientedLine(vec2 p, vec2 dir, float halfLen, float thick) {
  vec2 n = dir * inversesqrt(max(dot(dir, dir), 1e-8));
  return stroke(sdSegment(p, -n * halfLen, n * halfLen), thick);
}

float markVertical(vec2 p, float s, float thick) {
  return stroke(sdSegment(p, vec2(0.0, -s), vec2(0.0, s)), thick);
}

float markSlash(vec2 p, float s, float thick) {
  return stroke(sdSegment(p, vec2(-s * 0.72, -s), vec2(s * 0.72, s)), thick);
}

float markLeftBracket(vec2 p, float s, float thick) {
  float x = -s * 0.48;
  float top = stroke(sdSegment(p, vec2(x, s), vec2(s * 0.35, s)), thick);
  float side = stroke(sdSegment(p, vec2(x, -s), vec2(x, s)), thick);
  float bottom = stroke(sdSegment(p, vec2(x, -s), vec2(s * 0.35, -s)), thick);
  return max(side, max(top, bottom));
}

float markRightBracket(vec2 p, float s, float thick) {
  float x = s * 0.48;
  float top = stroke(sdSegment(p, vec2(-s * 0.35, s), vec2(x, s)), thick);
  float side = stroke(sdSegment(p, vec2(x, -s), vec2(x, s)), thick);
  float bottom = stroke(sdSegment(p, vec2(-s * 0.35, -s), vec2(x, -s)), thick);
  return max(side, max(top, bottom));
}

float markGlyph(vec2 p, float glyph, float s, float thick) {
  if (glyph < 0.5) return markVertical(p, s, thick);
  if (glyph < 1.5) return markLeftBracket(p, s, thick);
  if (glyph < 2.5) return markRightBracket(p, s, thick);
  return markSlash(p, s, thick);
}

float readEyeDepth(vec2 uv) {
  vec2 t = clamp(uv, vec2(0.001), vec2(0.999));
  float d = texture2D(tDepth, t).x;
  float viewZ = perspectiveDepthToViewZ(d, uCameraNear, uCameraFar);
  return -viewZ;
}

vec3 decodeNormal(vec2 uv) {
  vec3 packed = texture2D(tNormal, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
  return packed * 2.0 - 1.0;
}

vec3 sampleNormal(vec2 uv, float px) {
  vec2 e = vec2(px, 0.0) / uResolution;
  vec3 n = decodeNormal(uv);
  n += decodeNormal(uv + e);
  n += decodeNormal(uv - e);
  n += decodeNormal(uv + e.yx);
  n += decodeNormal(uv - e.yx);
  float len = length(n);
  return len > 1e-4 ? n / len : vec3(0.0);
}

float depthDiscontinuity(vec2 uv, float distPx) {
  vec2 span = vec2(distPx) / uResolution;
  float c = readEyeDepth(uv);
  float l = abs(readEyeDepth(uv - vec2(span.x, 0.0)) - c);
  float r = abs(readEyeDepth(uv + vec2(span.x, 0.0)) - c);
  float d = abs(readEyeDepth(uv - vec2(0.0, span.y)) - c);
  float u = abs(readEyeDepth(uv + vec2(0.0, span.y)) - c);
  return max(max(l, r), max(d, u)) / max(c, 0.15);
}

vec2 planeDir(vec3 n) {
  vec3 a = abs(n);
  if (a.y >= a.x && a.y >= a.z * 0.82) return vec2(1.0, 0.0);
  if (a.x >= a.y && a.x >= a.z * 0.82) {
    return n.x >= 0.0 ? vec2(0.0, 1.0) : vec2(-0.7071, 0.7071);
  }
  return vec2(0.7071, 0.7071);
}

vec3 chooseInk(vec2 cellId) {
  float total = max(uCyanPercent + uRedPercent + uWhitePercent, 0.001);
  float cyanCut = max(uCyanPercent, 0.0) / total;
  float redCut = cyanCut + max(uRedPercent, 0.0) / total;
  float pick = hash21(cellId + vec2(91.7, 37.1));
  if (pick < cyanCut) return uCyan;
  if (pick < redCut) return uRed;
  return uWhite;
}

float animatedGlyph(vec2 cellId, float h, float h2) {
  float speedVariation = mix(0.72, 1.28, h2);
  float frame = floor(uTime * max(uGlyphSpeed, 0.001) * speedVariation);
  if (frame < 1.0) return 0.0;

  float randomGlyph = floor(hash21(cellId + vec2(frame * 17.13, frame * 7.91)) * 4.0);
  if (frame < 2.0 && randomGlyph < 0.5) randomGlyph = 1.0 + floor(h * 3.0);
  return randomGlyph;
}

vec3 technical(vec2 frag) {
  float cell = max(uCellSize, 8.0);
  vec2 cellId = floor(frag / cell);
  vec2 origin = cellId * cell;

  float h = hash21(cellId);
  float h2 = hash21(cellId + 19.17);
  float hOcc = hash21(cellId + 41.7);

  vec2 jitter = (vec2(h, h2) - 0.5) * 0.44;
  vec2 local = (frag - origin) / cell - 0.5 - jitter * 0.5;
  vec2 center = origin + cell * (0.5 + jitter * 0.5);
  vec2 uv = clamp(center / uResolution, vec2(0.002), vec2(0.998));

  vec3 n = sampleNormal(uv, cell * 0.45);
  float nLen = length(decodeNormal(uv));
  float hasGeom = step(0.28, nLen);
  float eyeDepth = readEyeDepth(uv);
  float isSky = max(step(uCameraFar * 0.78, eyeDepth), 1.0 - hasGeom);
  float disc = depthDiscontinuity(uv, cell * 1.6);
  float discWide = depthDiscontinuity(uv, cell * 3.4);
  float edgeAmt = smoothstep(0.12, 0.55, disc * uDepthEdge);
  float nearBound = smoothstep(0.08, 0.4, discWide * uDepthEdge);

  float onSurface = hasGeom * (1.0 - isSky);
  float lensY = clamp((frag.y - (uPointer.y - uLensSize * 0.5)) / max(uLensSize, 1.0), 0.0, 1.0);
  float scanPos = fract(uTime * uScanSpeed);
  float scanWidth = 0.11;
  float scan = 1.0 - smoothstep(0.0, scanWidth, abs(lensY - scanPos));
  scan = max(scan, 1.0 - smoothstep(0.0, scanWidth, abs(lensY - scanPos + 1.0)));
  scan = max(scan, 1.0 - smoothstep(0.0, scanWidth, abs(lensY - scanPos - 1.0)));

  float occupancy = mix(uBackgroundDensity, uSurfaceDensity, onSurface);
  occupancy = mix(occupancy, 0.42, onSurface * nearBound);
  occupancy = mix(occupancy, mix(0.55, 0.70, h2), onSurface * edgeAmt);
  occupancy += uScanDensityBoost * scan * onSurface;
  occupancy = clamp(occupancy, 0.0, 0.70);
  if (hOcc > occupancy) return vec3(0.0);

  float phase = h * 6.28318530718;
  float pulse = 1.0 + uPulseAmount * sin(uTime * uAnimSpeed + phase);
  float lengthPulse = 1.0 + 0.08 * sin(uTime * 0.8 + phase);

  float span = mix(0.28, 0.42, edgeAmt);
  span = mix(span, 0.52, edgeAmt * edgeAmt);
  span *= uVectorLength / 0.36;
  span *= lengthPulse * (1.0 + 0.10 * scan);
  span = clamp(span, 0.22, 0.58);

  float glyph = animatedGlyph(cellId, h, h2);
  float glyphSize = span * 0.46;
  float thick = mix(0.016, 0.022, edgeAmt);
  vec3 ink = chooseInk(cellId);
  ink = mix(ink, uWhite, scan * edgeAmt * 0.35);

  float intensity = mix(0.82, 1.08, edgeAmt) * uMarkBrightness * mix(0.7, 1.0, hasGeom);
  intensity *= pulse * (1.0 + uScanBoost * scan);

  vec3 color = ink * markGlyph(local, glyph, glyphSize, thick) * intensity;

  float guide = step(0.92, h2) * edgeAmt;
  if (guide > 0.0) {
    vec2 dir = planeDir(n);
    vec2 perp = vec2(-dir.y, dir.x);
    color += ink * orientedLine(local + perp * 0.08, dir, span * 0.32, thick * 0.75) * intensity * guide * 0.45;
  }

  return color;
}

void main() {
  vec3 sceneColor = texture2D(tScene, vUv).rgb;
  vec2 delta = abs(gl_FragCoord.xy - uPointer);
  float inside = step(max(delta.x, delta.y), uLensSize * 0.5) * uActive * uEnabled;
  vec3 color = mix(sceneColor, technical(gl_FragCoord.xy), inside);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function createTechnicalLens(renderer: THREE.WebGLRenderer) {
  const params: LensParams = { ...DEFAULT_LENS }
  const size = new THREE.Vector2()
  renderer.getDrawingBufferSize(size)

  const depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType)
  depthTexture.format = THREE.DepthFormat
  depthTexture.minFilter = THREE.NearestFilter
  depthTexture.magFilter = THREE.NearestFilter
  depthTexture.generateMipmaps = false

  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 4,
    depthTexture,
  })
  target.texture.name = 'TechnicalLens.scene'
  target.depthTexture = depthTexture

  const normalSize = new THREE.Vector2(
    Math.max(1, Math.floor(size.x * NORMAL_SCALE)),
    Math.max(1, Math.floor(size.y * NORMAL_SCALE)),
  )
  const normalTarget = new THREE.WebGLRenderTarget(normalSize.x, normalSize.y, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.NoColorSpace,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
  })
  normalTarget.texture.name = 'TechnicalLens.normal'

  const normalMaterial = new THREE.MeshNormalMaterial()
  const normalClear = new THREE.Color(0.5, 0.5, 0.5)

  const uniforms = {
    tScene: { value: target.texture },
    tDepth: { value: depthTexture },
    tNormal: { value: normalTarget.texture },
    uResolution: { value: size.clone() },
    uPointer: { value: new THREE.Vector2(-1e6, -1e6) },
    uLensSize: { value: params.lensSize },
    uCellSize: { value: params.cellSize },
    uActive: { value: 0 },
    uEnabled: { value: params.enabled ? 1 : 0 },
    uTime: { value: 0 },
    uDepthEdge: { value: params.depthEdge },
    uSurfaceDensity: { value: params.surfaceDensity },
    uBackgroundDensity: { value: params.backgroundDensity },
    uMarkBrightness: { value: params.markBrightness },
    uVectorLength: { value: params.vectorLength },
    uAnimSpeed: { value: params.animSpeed },
    uPulseAmount: { value: params.pulseAmount },
    uGlyphSpeed: { value: params.glyphSpeed },
    uScanSpeed: { value: params.scanSpeed },
    uScanBoost: { value: params.scanBoost },
    uScanDensityBoost: { value: params.scanDensityBoost },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 48 },
    uCyan: { value: new THREE.Color(params.cyan) },
    uRed: { value: new THREE.Color(params.red) },
    uWhite: { value: new THREE.Color(params.white) },
    uCyanPercent: { value: params.cyanPercent },
    uRedPercent: { value: params.redPercent },
    uWhitePercent: { value: params.whitePercent },
  }

  const material = new THREE.ShaderMaterial({
    name: 'TechnicalLens',
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  })

  const quad = new FullScreenQuad(material)
  const pointerCss = new THREE.Vector2(-1, -1)
  let pointerActive = false

  const syncSizeUniforms = () => {
    renderer.getDrawingBufferSize(size)
    uniforms.uResolution.value.copy(size)
    const canvas = renderer.domElement
    const cssW = Math.max(canvas.clientWidth, 1)
    const cssH = Math.max(canvas.clientHeight, 1)
    const sx = size.x / cssW
    const sy = size.y / cssH
    uniforms.uLensSize.value = params.lensSize * sx
    uniforms.uCellSize.value = params.cellSize * sx
    uniforms.uPointer.value.set(pointerCss.x * sx, (cssH - pointerCss.y) * sy)
  }

  const resize = () => {
    renderer.getDrawingBufferSize(size)
    const w = Math.max(1, Math.floor(size.x))
    const h = Math.max(1, Math.floor(size.y))
    if (target.width !== w || target.height !== h) target.setSize(w, h)
    const nw = Math.max(1, Math.floor(w * NORMAL_SCALE))
    const nh = Math.max(1, Math.floor(h * NORMAL_SCALE))
    if (normalTarget.width !== nw || normalTarget.height !== nh) normalTarget.setSize(nw, nh)
    uniforms.tDepth.value = depthTexture
    uniforms.tNormal.value = normalTarget.texture
    syncSizeUniforms()
  }

  const setPointer = (clientX: number, clientY: number) => {
    const canvas = renderer.domElement
    const rect = canvas.getBoundingClientRect()
    pointerCss.set(clientX - rect.left, clientY - rect.top)
    syncSizeUniforms()
  }

  const setPointerActive = (active: boolean) => {
    pointerActive = active
    uniforms.uActive.value = active && params.enabled ? 1 : 0
  }

  const render = (scene: THREE.Scene, camera: THREE.Camera, time: number) => {
    uniforms.uTime.value = time
    uniforms.uEnabled.value = params.enabled ? 1 : 0
    uniforms.uActive.value = pointerActive && params.enabled ? 1 : 0
    uniforms.uDepthEdge.value = params.depthEdge
    uniforms.uSurfaceDensity.value = params.surfaceDensity
    uniforms.uBackgroundDensity.value = params.backgroundDensity
    uniforms.uMarkBrightness.value = params.markBrightness
    uniforms.uVectorLength.value = params.vectorLength
    uniforms.uAnimSpeed.value = params.animSpeed
    uniforms.uPulseAmount.value = params.pulseAmount
    uniforms.uGlyphSpeed.value = params.glyphSpeed
    uniforms.uScanSpeed.value = params.scanSpeed
    uniforms.uScanBoost.value = params.scanBoost
    uniforms.uScanDensityBoost.value = params.scanDensityBoost
    uniforms.uCyan.value.set(params.cyan)
    uniforms.uRed.value.set(params.red)
    uniforms.uWhite.value.set(params.white)
    uniforms.uCyanPercent.value = params.cyanPercent
    uniforms.uRedPercent.value = params.redPercent
    uniforms.uWhitePercent.value = params.whitePercent
    uniforms.tDepth.value = depthTexture
    uniforms.tNormal.value = normalTarget.texture

    if (camera instanceof THREE.PerspectiveCamera) {
      uniforms.uCameraNear.value = camera.near
      uniforms.uCameraFar.value = camera.far
    }
    syncSizeUniforms()

    const prevShadow = renderer.shadowMap.enabled
    const prevBackground = scene.background
    const prevOverride = scene.overrideMaterial

    renderer.setRenderTarget(target)
    renderer.render(scene, camera)

    if (pointerActive && params.enabled) {
      renderer.shadowMap.enabled = false
      scene.background = normalClear
      scene.overrideMaterial = normalMaterial
      renderer.setRenderTarget(normalTarget)
      renderer.render(scene, camera)
      scene.overrideMaterial = prevOverride
      scene.background = prevBackground
      renderer.shadowMap.enabled = prevShadow
    }

    renderer.setRenderTarget(null)
    quad.render(renderer)
  }

  const dispose = () => {
    target.dispose()
    depthTexture.dispose()
    normalTarget.dispose()
    normalMaterial.dispose()
    material.dispose()
    quad.dispose()
  }

  resize()
  return { params, render, setPointer, setPointerActive, resize, dispose }
}
