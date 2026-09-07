import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export type LensParams = {
  enabled: boolean
  lensSize: number
  cellSize: number
  edgeStrength: number
  coarseInfluence: number
  fineInfluence: number
  lumaInfluence: number
  ambientDensity: number
  markBrightness: number
  vectorLength: number
  glitch: number
  animSpeed: number
}

export const DEFAULT_LENS: LensParams = {
  enabled: true,
  lensSize: 240,
  cellSize: 7,
  edgeStrength: 2.0,
  coarseInfluence: 0.72,
  fineInfluence: 0.28,
  lumaInfluence: 0.14,
  ambientDensity: 0.28,
  markBrightness: 1.12,
  vectorLength: 0.58,
  glitch: 0.016,
  animSpeed: 0.3,
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
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uLensSize;
uniform float uCellSize;
uniform float uActive;
uniform float uEnabled;
uniform float uTime;
uniform float uEdgeStrength;
uniform float uCoarse;
uniform float uFine;
uniform float uLumaInfluence;
uniform float uAmbient;
uniform float uMarkBrightness;
uniform float uVectorLength;
uniform float uGlitch;
uniform float uAnimSpeed;
uniform vec3 uCyan;
uniform vec3 uRed;
uniform vec3 uYellow;
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
  return stroke(length(p) - 0.012, 0.02);
}

float markPlus(vec2 p, float s) {
  float a = stroke(sdSegment(p, vec2(-s, 0.0), vec2(s, 0.0)), 0.015);
  float b = stroke(sdSegment(p, vec2(0.0, -s), vec2(0.0, s)), 0.015);
  return max(a, b);
}

float markX(vec2 p, float s) {
  float a = stroke(sdSegment(p, vec2(-s, -s), vec2(s, s)), 0.015);
  float b = stroke(sdSegment(p, vec2(-s, s), vec2(s, -s)), 0.015);
  return max(a, b);
}

vec2 imageGrad(vec2 uv, float distPx) {
  vec2 span = vec2(distPx) / uResolution;
  float lL = luma(texture2D(tScene, uv - vec2(span.x, 0.0)).rgb);
  float lR = luma(texture2D(tScene, uv + vec2(span.x, 0.0)).rgb);
  float lD = luma(texture2D(tScene, uv - vec2(0.0, span.y)).rgb);
  float lU = luma(texture2D(tScene, uv + vec2(0.0, span.y)).rgb);
  return vec2(lR - lL, lU - lD);
}

vec3 fieldColor(vec2 tangent, float structure, float h) {
  float horiz = abs(tangent.x);
  vec3 color = mix(uRed, uCyan, smoothstep(0.32, 0.68, horiz));
  color = mix(color, mix(uCyan, uRed, h), 0.12);
  if (structure > 0.34 && h > 0.72) color = mix(color, uWhite, 0.55);
  else if (structure > 0.22 && h > 0.9) color = mix(color, uWhite, 0.28);
  if (h > 0.985 && structure > 0.18) color = mix(color, uYellow, 0.45);
  return color;
}

vec3 technical(vec2 frag) {
  float cell = max(uCellSize, 3.0);
  vec2 cellId = floor(frag / cell);
  vec2 origin = cellId * cell;
  vec2 local = (frag - origin) / cell - 0.5;

  float h = hash21(cellId);
  float h2 = hash21(cellId + 19.17);
  float h3 = hash21(cellId.yx + 4.2);
  float tq = floor(uTime / mix(0.48, 0.22, clamp(uAnimSpeed, 0.0, 1.0)));
  float ht = hash21(cellId + vec2(tq, 8.0));

  local += vec2(h - 0.5, h2 - 0.5) * 0.16;
  vec2 center = origin + cell * (0.5 + vec2(h - 0.5, h3 - 0.5) * 0.1);
  vec2 uv = center / uResolution;

  vec2 gFine = imageGrad(uv, cell * 0.5);
  vec2 gCoarse = imageGrad(uv, cell * 1.7);
  vec2 g = gCoarse * uCoarse + gFine * uFine;
  float magFine = length(gFine);
  float magCoarse = length(gCoarse);
  float mag = length(g);
  vec2 tangent = vec2(-g.y, g.x);
  tangent *= inversesqrt(max(dot(tangent, tangent), 1e-8));

  float l = luma(texture2D(tScene, uv).rgb);
  float structure =
    magCoarse * uEdgeStrength +
    magFine * uEdgeStrength * 0.32 +
    l * uLumaInfluence;

  float lenJitter = mix(0.88, 1.08, h2);
  float liveLen = mix(1.0, mix(0.94, 1.05, ht), uGlitch * 4.0);
  float halfLen = clamp(uVectorLength * 0.5 * lenJitter * liveLen, 0.16, 0.38);
  float thick = mix(0.011, 0.016, smoothstep(0.08, 0.3, magCoarse));
  float liveBright = mix(1.0, mix(0.88, 1.06, ht), 0.35 + uAnimSpeed * 0.2);

  vec3 color = vec3(0.0);

  if (structure > 0.11) {
    float edge = smoothstep(0.11, 0.36, structure);
    float intensity = mix(0.55, 1.0, edge) * uMarkBrightness * mix(0.9, 1.08, h) * liveBright;
    float gLine = orientedLine(local, tangent, halfLen * mix(0.78, 1.05, edge), thick);
    color += fieldColor(tangent, structure, h) * gLine * intensity;

    if (structure > 0.26 && h2 > 0.52 && h2 < 0.78) {
      vec2 normal = vec2(-tangent.y, tangent.x);
      float off = mix(0.5, 1.35, h3) / cell;
      float g2 = orientedLine(local + normal * off, tangent, halfLen * 0.82, thick * 0.75);
      vec3 alt = mix(uRed, uCyan, 1.0 - smoothstep(0.32, 0.68, abs(tangent.x)));
      color += alt * g2 * intensity * 0.42;
    }

    if (structure > 0.28 && h > 0.9) {
      float punct = h > 0.96 ? markX(local, 0.16) : markPlus(local, 0.18);
      color += mix(uWhite, uCyan, 0.35) * punct * intensity * 0.95;
    }
  } else {
    float appear = step(1.0 - uAmbient, h);
    float flicker = mix(appear, step(1.0 - uAmbient * mix(0.85, 1.15, ht), h3), 0.25);
    if (flicker < 0.5) return vec3(0.0);
    float dim = 0.16 * uMarkBrightness * mix(0.75, 1.0, h2) * liveBright;
    if (h3 > 0.62) {
      vec2 fallback = normalize(mix(vec2(1.0, 0.12), tangent, 0.35));
      color += mix(uCyan, uRed, step(0.55, h)) * orientedLine(local, fallback, 0.12, 0.012) * dim;
    } else {
      color += mix(uCyan, uWhite, 0.2) * markDot(local) * dim * 1.15;
    }
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

  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 4,
  })
  target.texture.name = 'TechnicalLens.scene'

  const uniforms = {
    tScene: { value: target.texture },
    uResolution: { value: size.clone() },
    uPointer: { value: new THREE.Vector2(-1e6, -1e6) },
    uLensSize: { value: params.lensSize },
    uCellSize: { value: params.cellSize },
    uActive: { value: 0 },
    uEnabled: { value: params.enabled ? 1 : 0 },
    uTime: { value: 0 },
    uEdgeStrength: { value: params.edgeStrength },
    uCoarse: { value: params.coarseInfluence },
    uFine: { value: params.fineInfluence },
    uLumaInfluence: { value: params.lumaInfluence },
    uAmbient: { value: params.ambientDensity },
    uMarkBrightness: { value: params.markBrightness },
    uVectorLength: { value: params.vectorLength },
    uGlitch: { value: params.glitch },
    uAnimSpeed: { value: params.animSpeed },
    uCyan: { value: new THREE.Color('#36DDF5') },
    uRed: { value: new THREE.Color('#FF3B61') },
    uYellow: { value: new THREE.Color('#FFE18A') },
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
    uniforms.uEdgeStrength.value = params.edgeStrength
    uniforms.uCoarse.value = params.coarseInfluence
    uniforms.uFine.value = params.fineInfluence
    uniforms.uLumaInfluence.value = params.lumaInfluence
    uniforms.uAmbient.value = params.ambientDensity
    uniforms.uMarkBrightness.value = params.markBrightness
    uniforms.uVectorLength.value = params.vectorLength
    uniforms.uGlitch.value = params.glitch
    uniforms.uAnimSpeed.value = params.animSpeed
    syncSizeUniforms()

    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    quad.render(renderer)
  }

  const dispose = () => {
    target.dispose()
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
