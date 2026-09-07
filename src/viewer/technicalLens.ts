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
  glitch: number
  animSpeed: number
}

export const DEFAULT_LENS: LensParams = {
  enabled: true,
  lensSize: 240,
  cellSize: 12,
  depthEdge: 1.8,
  surfaceDensity: 0.12,
  backgroundDensity: 0.03,
  markBrightness: 1.05,
  vectorLength: 0.36,
  glitch: 0,
  animSpeed: 0,
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
uniform float uGlitch;
uniform float uAnimSpeed;
uniform float uCameraNear;
uniform float uCameraFar;
uniform vec3 uCyan;
uniform vec3 uRed;
uniform vec3 uWhite;

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

float markDot(vec2 p) {
  return stroke(length(p) - 0.016, 0.02);
}

float markPlus(vec2 p, float s) {
  float a = stroke(sdSegment(p, vec2(-s, 0.0), vec2(s, 0.0)), 0.016);
  float b = stroke(sdSegment(p, vec2(0.0, -s), vec2(0.0, s)), 0.016);
  return max(a, b);
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

vec3 planeInk(vec3 n, float edgeAmt, float h) {
  vec3 a = abs(n);
  vec3 ink = a.x > a.y ? uRed : uCyan;
  if (edgeAmt > 0.62 && h > 0.9) ink = uWhite;
  return ink;
}

vec3 technical(vec2 frag) {
  float cell = max(uCellSize, 8.0);
  vec2 cellId = floor(frag / cell);
  vec2 origin = cellId * cell;

  float h = hash21(cellId);
  float h2 = hash21(cellId + 19.17);
  float h3 = hash21(cellId.yx + 4.2);
  float hOcc = hash21(cellId + 41.7);
  float hMark = hash21(cellId + 71.3);

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

  float occupancy = uBackgroundDensity;
  occupancy = mix(occupancy, uSurfaceDensity, hasGeom * (1.0 - isSky));
  occupancy = mix(occupancy, mix(0.2, 0.3, h3), hasGeom * (1.0 - isSky) * nearBound);
  occupancy = mix(occupancy, mix(0.4, 0.55, h2), hasGeom * (1.0 - isSky) * edgeAmt);
  occupancy = clamp(occupancy, 0.0, 0.55);

  if (hOcc > occupancy) return vec3(0.0);

  vec2 dir = planeDir(n);
  float span = mix(0.28, 0.42, edgeAmt);
  span = mix(span, 0.52, edgeAmt * edgeAmt);
  span *= uVectorLength / 0.36;
  span = clamp(span, 0.22, 0.55);
  float halfLen = span * 0.5;
  float thick = mix(0.016, 0.022, edgeAmt);

  float useCross = step(0.95, hMark) * step(0.45, edgeAmt);
  float useDot = (1.0 - useCross) * step(hMark, 0.20);
  float useLine = 1.0 - useCross - useDot;

  vec3 ink = planeInk(n, edgeAmt, h);
  float intensity = mix(0.72, 1.08, edgeAmt) * uMarkBrightness * mix(0.45, 1.0, hasGeom);

  vec3 color = vec3(0.0);
  color += ink * orientedLine(local, dir, halfLen, thick) * intensity * useLine;

  if (useLine > 0.5 && edgeAmt > 0.55 && h2 > 0.84) {
    vec2 perp = vec2(-dir.y, dir.x);
    vec3 alt = ink.g > ink.r ? uRed : uCyan;
    color += alt * orientedLine(local + perp * 0.07, dir, halfLen * 0.72, thick * 0.85) * intensity * 0.55;
  }

  color += ink * markDot(local) * intensity * 0.85 * useDot;
  color += mix(ink, uWhite, 0.35) * markPlus(local, 0.11) * intensity * useCross;

  if (uGlitch > 0.004 && uAnimSpeed > 0.01) {
    float gPulse = step(0.996, hash21(cellId + vec2(floor(uTime * uAnimSpeed), 9.0)));
    color *= 1.0 - gPulse * uGlitch * 0.35;
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
    uGlitch: { value: params.glitch },
    uAnimSpeed: { value: params.animSpeed },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 48 },
    uCyan: { value: new THREE.Color('#36DDF5') },
    uRed: { value: new THREE.Color('#FF3B61') },
    uWhite: { value: new THREE.Color('#DCEEFF') },
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
    uniforms.uGlitch.value = params.glitch
    uniforms.uAnimSpeed.value = params.animSpeed
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

  return {
    params,
    render,
    setPointer,
    setPointerActive,
    resize,
    dispose,
  }
}

export type TechnicalLens = ReturnType<typeof createTechnicalLens>
