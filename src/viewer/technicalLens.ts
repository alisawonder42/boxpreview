import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export type LensParams = {
  enabled: boolean
  lensSize: number
  cellSize: number
  edgeStrength: number
  lumaInfluence: number
  glyphBrightness: number
  glitch: number
  animSpeed: number
}

export const DEFAULT_LENS: LensParams = {
  enabled: true,
  lensSize: 260,
  cellSize: 8,
  edgeStrength: 1.4,
  lumaInfluence: 0.32,
  glyphBrightness: 1.05,
  glitch: 0.045,
  animSpeed: 0.65,
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
uniform float uLumaInfluence;
uniform float uGlyphBrightness;
uniform float uGlitch;
uniform float uAnimSpeed;
uniform vec3 uCyan;
uniform vec3 uRed;
uniform vec3 uYellow;
uniform vec3 uWhite;
uniform vec3 uViolet;

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
  float aa = max(fwidth(d), 0.0015);
  return 1.0 - smoothstep(width, width + aa, d);
}

float glyphDot(vec2 p) {
  return stroke(length(p) - 0.015, 0.028);
}

float glyphH(vec2 p) {
  return stroke(sdSegment(p, vec2(-0.34, 0.0), vec2(0.34, 0.0)), 0.018);
}

float glyphV(vec2 p) {
  return stroke(sdSegment(p, vec2(0.0, -0.34), vec2(0.0, 0.34)), 0.018);
}

float glyphSlash(vec2 p) {
  return stroke(sdSegment(p, vec2(-0.28, -0.28), vec2(0.28, 0.28)), 0.018);
}

float glyphBack(vec2 p) {
  return stroke(sdSegment(p, vec2(-0.28, 0.28), vec2(0.28, -0.28)), 0.018);
}

float glyphPlus(vec2 p) {
  return max(glyphH(p), glyphV(p));
}

float glyphX(vec2 p) {
  return max(glyphSlash(p), glyphBack(p));
}

vec3 pickColor(int kind, float mag, float h) {
  vec3 a = uCyan;
  vec3 b = uRed;
  if (kind == 1 || kind == 2) a = uCyan;
  else if (kind == 3) a = uRed;
  else if (kind == 4) { a = uYellow; b = uCyan; }
  else if (kind == 5) { a = uViolet; b = uRed; }
  else if (kind == 6) { a = uWhite; b = uCyan; }
  else { a = uRed; b = uYellow; }

  vec3 color = mix(a, b, step(0.82, h) * 0.55);
  if (h > 0.93 && mag > 0.12) color = mix(color, uWhite, 0.35);
  if (h < 0.08 && mag > 0.18) color = mix(color, uViolet, 0.4);
  return color;
}

vec3 technical(vec2 frag) {
  float cell = max(uCellSize, 3.0);
  vec2 cellId = floor(frag / cell);
  vec2 origin = cellId * cell;
  vec2 local = (frag - origin) / cell - 0.5;

  float tq = floor(uTime * mix(3.0, 14.0, uAnimSpeed));
  float h = hash21(cellId);
  float ht = hash21(cellId + vec2(tq, 17.0));
  float rowH = hash21(vec2(cellId.y, tq));

  local.x += (rowH - 0.5) * uGlitch * 0.35;
  local += (vec2(hash21(cellId.yx), hash21(cellId + 9.1)) - 0.5) * 0.04;

  if (ht < uGlitch * 0.55) return vec3(0.0);

  vec2 center = origin + cell * 0.5;
  vec2 uv = center / uResolution;
  vec2 span = vec2(cell * 0.42) / uResolution;

  vec3 cC = texture2D(tScene, uv).rgb;
  vec3 cL = texture2D(tScene, uv - vec2(span.x, 0.0)).rgb;
  vec3 cR = texture2D(tScene, uv + vec2(span.x, 0.0)).rgb;
  vec3 cD = texture2D(tScene, uv - vec2(0.0, span.y)).rgb;
  vec3 cU = texture2D(tScene, uv + vec2(0.0, span.y)).rgb;

  float l = luma(cC);
  float dx = luma(cR) - luma(cL);
  float dy = luma(cU) - luma(cD);
  float mag = length(vec2(dx, dy));
  float structure = l * uLumaInfluence + mag * uEdgeStrength;

  int kind = 0;
  float adx = abs(dx);
  float ady = abs(dy);
  if (structure < 0.045) {
    kind = 0;
  } else if (mag > 0.22) {
    kind = abs(adx - ady) < mag * 0.28 ? 7 : 6;
  } else if (adx > ady * 1.35) {
    kind = 2;
  } else if (ady > adx * 1.35) {
    kind = 3;
  } else {
    kind = dx * dy >= 0.0 ? 4 : 5;
  }

  if (ht > 1.0 - uGlitch * 0.8) {
    kind = int(floor(hash21(cellId + 3.7) * 8.0));
  }

  float g = 0.0;
  if (kind == 0) g = glyphDot(local);
  else if (kind == 2) g = glyphH(local);
  else if (kind == 3) g = glyphV(local);
  else if (kind == 4) g = glyphSlash(local);
  else if (kind == 5) g = glyphBack(local);
  else if (kind == 6) g = glyphPlus(local);
  else g = glyphX(local);

  float intensity = smoothstep(0.02, 0.42, structure);
  intensity *= mix(0.55, 1.0, smoothstep(0.04, 0.28, mag));
  intensity *= mix(0.82, 1.08, h);
  intensity *= uGlyphBrightness;
  intensity *= mix(1.0, 0.7, step(0.97, ht));

  vec3 mark = pickColor(kind, mag, h) * g * intensity;
  return mark;
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
    uLumaInfluence: { value: params.lumaInfluence },
    uGlyphBrightness: { value: params.glyphBrightness },
    uGlitch: { value: params.glitch },
    uAnimSpeed: { value: params.animSpeed },
    uCyan: { value: new THREE.Color('#36DDF5') },
    uRed: { value: new THREE.Color('#FF3B61') },
    uYellow: { value: new THREE.Color('#FFE18A') },
    uWhite: { value: new THREE.Color('#DCEEFF') },
    uViolet: { value: new THREE.Color('#A88CFF') },
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
    uniforms.uLumaInfluence.value = params.lumaInfluence
    uniforms.uGlyphBrightness.value = params.glyphBrightness
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
