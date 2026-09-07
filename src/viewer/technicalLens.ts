import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export type LensParams = {
  enabled: boolean
  lensSize: number
  cellSize: number
  depthEdge: number
  colorEdge: number
  depthCoarse: number
  depthFine: number
  surfaceDensity: number
  backgroundDensity: number
  textureInfluence: number
  markBrightness: number
  vectorLength: number
  glitch: number
  animSpeed: number
}

export const DEFAULT_LENS: LensParams = {
  enabled: true,
  lensSize: 240,
  cellSize: 10,
  depthEdge: 2.2,
  colorEdge: 0.25,
  depthCoarse: 1.0,
  depthFine: 0.4,
  surfaceDensity: 0.28,
  backgroundDensity: 0.06,
  textureInfluence: 0.12,
  markBrightness: 1.15,
  vectorLength: 0.78,
  glitch: 0.01,
  animSpeed: 0.25,
}

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
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uLensSize;
uniform float uCellSize;
uniform float uActive;
uniform float uEnabled;
uniform float uTime;
uniform float uDepthEdge;
uniform float uColorEdge;
uniform float uDepthCoarse;
uniform float uDepthFine;
uniform float uSurfaceDensity;
uniform float uBackgroundDensity;
uniform float uTextureInfluence;
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

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

float stroke(float d, float width) {
  float aa = max(fwidth(d), 0.0012);
  return 1.0 - smoothstep(width, width + aa, d);
}

float orientedLine(vec2 p, vec2 dir, float halfLen, float thick) {
  vec2 n = dir * inversesqrt(max(dot(dir, dir), 1e-8));
  return stroke(sdSegment(p, -n * halfLen, n * halfLen), thick);
}

float markDot(vec2 p) {
  return stroke(length(p) - 0.012, 0.018);
}

float markPlus(vec2 p, float s) {
  float a = stroke(sdSegment(p, vec2(-s, 0.0), vec2(s, 0.0)), 0.012);
  float b = stroke(sdSegment(p, vec2(0.0, -s), vec2(0.0, s)), 0.012);
  return max(a, b);
}

float readEyeDepth(vec2 uv) {
  vec2 t = clamp(uv, vec2(0.001), vec2(0.999));
  float d = texture2D(tDepth, t).x;
  float viewZ = perspectiveDepthToViewZ(d, uCameraNear, uCameraFar);
  return -viewZ;
}

vec2 colorGrad(vec2 uv, float distPx) {
  vec2 span = vec2(distPx) / uResolution;
  float lL = luma(texture2D(tScene, uv - vec2(span.x, 0.0)).rgb);
  float lR = luma(texture2D(tScene, uv + vec2(span.x, 0.0)).rgb);
  float lD = luma(texture2D(tScene, uv - vec2(0.0, span.y)).rgb);
  float lU = luma(texture2D(tScene, uv + vec2(0.0, span.y)).rgb);
  return vec2(lR - lL, lU - lD);
}

vec2 depthGrad(vec2 uv, float distPx) {
  vec2 span = vec2(distPx) / uResolution;
  float dL = readEyeDepth(uv - vec2(span.x, 0.0));
  float dR = readEyeDepth(uv + vec2(span.x, 0.0));
  float dD = readEyeDepth(uv - vec2(0.0, span.y));
  float dU = readEyeDepth(uv + vec2(0.0, span.y));
  return vec2(dR - dL, dU - dD);
}

vec3 fieldColor(vec2 tangent, float edgeAmt, float h) {
  float horiz = abs(tangent.x);
  vec3 color = mix(uRed, uCyan, smoothstep(0.28, 0.72, horiz));
  color = mix(color, mix(uCyan, uRed, step(h, 0.5)), 0.14 * (1.0 - abs(abs(tangent.x) - abs(tangent.y))));
  color = mix(color, uWhite, edgeAmt * 0.78);
  return color;
}

vec3 technical(vec2 frag) {
  float cell = max(uCellSize, 6.0);
  vec2 cellId = floor(frag / cell);
  vec2 origin = cellId * cell;

  float h = hash21(cellId);
  float h2 = hash21(cellId + 19.17);
  float h3 = hash21(cellId.yx + 4.2);
  float hOcc = hash21(cellId + 41.7);
  float hMark = hash21(cellId + 71.3);

  vec2 jitter = vec2(h - 0.5, h2 - 0.5) * 0.40;
  vec2 local = (frag - origin) / cell - 0.5 - jitter * 0.5;
  vec2 center = origin + cell * (0.5 + jitter * 0.5);
  vec2 uv = clamp(center / uResolution, vec2(0.002), vec2(0.998));

  float eyeDepth = readEyeDepth(uv);
  float isSky = step(uCameraFar * 0.78, eyeDepth);
  float invDepth = 1.0 / max(eyeDepth, 0.15);

  vec2 dFine = depthGrad(uv, cell * 0.55);
  vec2 dCoarse = depthGrad(uv, cell * 1.75);
  vec2 dWide = depthGrad(uv, cell * 4.2);
  vec2 cFine = colorGrad(uv, cell * 0.55);
  vec2 cCoarse = colorGrad(uv, cell * 1.75);

  float magDFine = length(dFine) * invDepth;
  float magDCoarse = length(dCoarse) * invDepth;
  float magDWide = length(dWide) * invDepth;
  float magCFine = length(cFine);
  float magCCoarse = length(cCoarse);

  float geometryStructure =
    magDCoarse * 14.0 * uDepthCoarse +
    magDFine * 5.5 * uDepthFine;
  float textureStructure =
    magCCoarse * 0.2 * uTextureInfluence +
    magCFine * 0.08 * uTextureInfluence;
  float structure = geometryStructure * uDepthEdge + textureStructure * uColorEdge;

  float edgeAmt = smoothstep(0.55, 2.4, geometryStructure);
  float nearFeature = smoothstep(0.18, 0.85, magDWide);

  float occupancy = mix(uBackgroundDensity, uBackgroundDensity * 1.15, 1.0 - isSky);
  occupancy = mix(occupancy, uSurfaceDensity * 0.38, (1.0 - isSky) * smoothstep(0.18, 0.7, geometryStructure));
  occupancy = mix(occupancy, uSurfaceDensity * 0.85, (1.0 - isSky) * smoothstep(0.55, 1.35, geometryStructure));
  occupancy = mix(
    occupancy,
    mix(0.72, 0.88, clamp((geometryStructure - 1.35) * 0.32, 0.0, 1.0)),
    (1.0 - isSky) * edgeAmt
  );
  occupancy = mix(occupancy, occupancy * 1.2, (1.0 - isSky) * nearFeature * (1.0 - edgeAmt) * 0.4);
  occupancy = clamp(occupancy, 0.0, 0.90);

  if (hOcc > occupancy) return vec3(0.0);

  vec2 gDepth = dCoarse + dFine * 0.35;
  float gLen = length(gDepth);
  vec2 tangent;
  if (gLen > 1e-5) {
    tangent = normalize(vec2(-gDepth.y, gDepth.x));
  } else {
    vec2 gColor = cCoarse * 0.35 + cFine * 0.12;
    float cLen = length(gColor);
    tangent = cLen > 1e-5 ? normalize(vec2(-gColor.y, gColor.x)) : vec2(1.0, 0.0);
  }

  float breath = 0.97 + 0.03 * sin(uTime * (0.4 + uAnimSpeed * 0.5) + h * 6.28318);
  float halfLen = mix(0.32, 0.44, edgeAmt) * (uVectorLength / 0.72) * mix(0.98, 1.03, h2) * breath;
  halfLen = clamp(halfLen, 0.26, 0.50);
  float thick = mix(0.008, 0.014, edgeAmt);

  float useCross = step(2.8, geometryStructure) * step(0.985, hMark) * (1.0 - isSky);
  float useDot = (1.0 - useCross) * step(hMark, 0.075) * (1.0 - step(1.0, geometryStructure));
  float useLine = 1.0 - useCross - useDot;

  vec3 color = vec3(0.0);
  vec3 ink = fieldColor(tangent, edgeAmt, h);
  float intensity = mix(0.48, 1.12, edgeAmt) * uMarkBrightness * breath * mix(0.4, 1.0, 1.0 - isSky);

  color += ink * orientedLine(local, tangent, halfLen, thick) * intensity * useLine;

  if (useLine > 0.5 && edgeAmt > 0.62 && h2 > 0.7) {
    vec2 normal = vec2(-tangent.y, tangent.x);
    float off = mix(0.05, 0.085, h3);
    vec3 alt = mix(uRed, uCyan, 1.0 - smoothstep(0.28, 0.72, abs(tangent.x)));
    color += alt * orientedLine(local + normal * off, tangent, halfLen * 0.78, thick * 0.65) * intensity * 0.32;
  }

  if (useLine > 0.5 && edgeAmt > 0.5 && h3 > 0.72) {
    float along = fract(dot(local, tangent) * 1.6 + h * 2.0);
    float dash = step(0.22, along) * step(along, 0.78);
    vec2 shift = tangent * mix(-0.12, 0.12, h2);
    color += uWhite * orientedLine(local + shift, tangent, halfLen * 0.42, thick * 0.7) * dash * intensity * 0.28 * edgeAmt;
  }

  color += mix(uCyan, uWhite, 0.25) * markDot(local) * intensity * 0.72 * useDot;
  color += uWhite * markPlus(local, 0.16) * intensity * 0.9 * useCross;

  if (uGlitch > 0.004) {
    float gPulse = step(0.993, hash21(cellId + vec2(floor(uTime * 1.2), 9.0)));
    color *= 1.0 - gPulse * uGlitch * 0.4;
  }

  return color * step(0.001, occupancy);
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

  const uniforms = {
    tScene: { value: target.texture },
    tDepth: { value: depthTexture },
    uResolution: { value: size.clone() },
    uPointer: { value: new THREE.Vector2(-1e6, -1e6) },
    uLensSize: { value: params.lensSize },
    uCellSize: { value: params.cellSize },
    uActive: { value: 0 },
    uEnabled: { value: params.enabled ? 1 : 0 },
    uTime: { value: 0 },
    uDepthEdge: { value: params.depthEdge },
    uColorEdge: { value: params.colorEdge },
    uDepthCoarse: { value: params.depthCoarse },
    uDepthFine: { value: params.depthFine },
    uSurfaceDensity: { value: params.surfaceDensity },
    uBackgroundDensity: { value: params.backgroundDensity },
    uTextureInfluence: { value: params.textureInfluence },
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
    uniforms.tDepth.value = depthTexture
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
    uniforms.uColorEdge.value = params.colorEdge
    uniforms.uDepthCoarse.value = params.depthCoarse
    uniforms.uDepthFine.value = params.depthFine
    uniforms.uSurfaceDensity.value = params.surfaceDensity
    uniforms.uBackgroundDensity.value = params.backgroundDensity
    uniforms.uTextureInfluence.value = params.textureInfluence
    uniforms.uMarkBrightness.value = params.markBrightness
    uniforms.uVectorLength.value = params.vectorLength
    uniforms.uGlitch.value = params.glitch
    uniforms.uAnimSpeed.value = params.animSpeed
    uniforms.tDepth.value = depthTexture
    if (camera instanceof THREE.PerspectiveCamera) {
      uniforms.uCameraNear.value = camera.near
      uniforms.uCameraFar.value = camera.far
    }
    syncSizeUniforms()

    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    quad.render(renderer)
  }

  const dispose = () => {
    target.dispose()
    depthTexture.dispose()
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
