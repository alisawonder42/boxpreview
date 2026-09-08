import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export const DEFAULT_CRT = {
  enabled: false, strength: 0.6, lineSpacing: 1.5, lineStrength: 0.4,
  lineIrregularity: 0, calmDisplacement: 0.35, largeDisplacement: 24,
  mediumDisplacement: 9, jitter: 3.25, rowStep: 3, tearStrength: 36,
  tearWidth: 0.035, rgbSeparation: 4.8, burstRate: 1.2,
  burstDuration: 0.07, settleTime: 0.16, amplitudeVariation: 0.08,
}
export type CRTParams = typeof DEFAULT_CRT

// Frame-rate independent event arrivals, with an attack, held state, and decay.
export function createSignalClock(random = Math.random) {
  let previousTime: number | undefined
  let start = -1e6
  let hold = 0.2
  let release = 0.3
  let seed = 1
  return (time: number, params: CRTParams, reducedMotion = false) => {
    const dt = previousTime === undefined ? 0 : Math.max(0, Math.min(time - previousTime, 0.1))
    previousTime = time
    if (reducedMotion) { start = -1e6; return { envelope: 0, seed } }
    if (time - start > hold + release && random() < 1 - Math.exp(-params.burstRate * dt)) {
      start = time
      hold = params.burstDuration * (0.65 + random() * 0.7)
      release = params.settleTime
      seed = 1 + random() * 999
    }
    const age = time - start
    const attack = Math.min(age / 0.025, 1)
    const tail = Math.max(0, 1 - Math.max(age - hold, 0) / Math.max(release, 0.001))
    return { envelope: Math.max(0, attack * tail * tail * (3 - 2 * tail)), seed }
  }
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D tFrame;
uniform sampler2D tOriginal;
uniform float uEffectOpacity;
uniform bool uCrtEnabled;
uniform vec2 uResolution;
uniform vec2 uLensCenter;
uniform float uLensSize;
uniform float uPixelRatio;
uniform float uTime;
uniform float uBurst;
uniform float uSeed;
uniform float uStrength;
uniform float uLineSpacing;
uniform float uLineStrength;
uniform float uLineIrregularity;
uniform float uCalmDisplacement;
uniform float uLargeDisplacement;
uniform float uMediumDisplacement;
uniform float uJitter;
uniform float uRowStep;
uniform float uTearStrength;
uniform float uTearWidth;
uniform float uRgbSeparation;
uniform float uAmplitudeVariation;
varying vec2 vUv;

float crtHash(float p) { return fract(sin(p * 127.1 + 311.7) * 43758.5453); }
float crtNoise(float p) {
  float i = floor(p), f = fract(p);
  return mix(crtHash(i), crtHash(i + 1.0), f * f * (3.0 - 2.0 * f));
}
float crtZone(float y, float center, float width) {
  return 1.0 - smoothstep(width * 0.35, width, abs(y - center));
}

vec3 crtRead(float x, float y) {
  // Black border, never repeat or clamp edge pixels into a long smear.
  float left = max(0.0, (uLensCenter.x - uLensSize * 0.5) / uResolution.x);
  float right = min(1.0, (uLensCenter.x + uLensSize * 0.5) / uResolution.x);
  if (x < left || x > right) return vec3(0.0);
  vec3 color = texture2D(tFrame, vec2(x, y)).rgb;
  float position = x * uResolution.x / max(uLineSpacing * uPixelRatio, 1.0);
  float irregular = (crtNoise(position * 0.09) - 0.5) * uLineIrregularity;
  float phase = fract(position + irregular);
  float aa = min(0.24, 0.6 / max(uLineSpacing * uPixelRatio, 1.0));
  float line = 1.0 - smoothstep(0.08, 0.08 + aa, abs(phase - 0.5));
  float variation = mix(1.0, 0.7 + crtHash(floor(position)) * 0.3, uLineIrregularity);
  // Multiplication preserves genuinely black source pixels.
  return color * (1.0 - line * uLineStrength * variation * uStrength);
}

void main() {
  vec2 distanceToCenter = abs(gl_FragCoord.xy - uLensCenter);
  if (max(distanceToCenter.x, distanceToCenter.y) >= uLensSize * 0.5) {
    // Preserve the source frame exactly outside the cursor window.
    gl_FragColor = texture2D(tFrame, vUv);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  if (!uCrtEnabled) {
    gl_FragColor = vec4(mix(texture2D(tOriginal, vUv).rgb, texture2D(tFrame, vUv).rgb, uEffectOpacity), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  float y = vUv.y;
  float heldTime = floor(uTime * 5.0);
  float steppedY = floor(y * uResolution.y / max(uRowStep * uPixelRatio, 1.0))
    * max(uRowStep * uPixelRatio, 1.0) / uResolution.y;
  float bandY = mix(y, steppedY, 0.8);
  float zoneCenter = 0.15 + crtHash(uSeed + 2.0) * 0.7;
  float zone = crtZone(y, zoneCenter, 0.12 + crtHash(uSeed + 9.0) * 0.22);
  float large = (crtNoise(bandY * 4.1 + uTime * 0.09 + uSeed) - 0.5) * 2.0;
  float medium = (crtNoise(bandY * 23.0 + uSeed * 3.0 + floor(uTime * 2.0) * 0.11) - 0.5) * 2.0;
  float fine = (crtNoise(steppedY * uResolution.y * 0.7 + heldTime * 17.0) - 0.5) * 2.0;
  float tearCenter = 0.08 + 0.84 * fract(crtHash(uSeed + 21.0) + uTime * 0.015);
  float tear = crtZone(y, tearCenter, uTearWidth);
  float tearDirection = crtHash(uSeed + 34.0) < 0.5 ? -1.0 : 1.0;
  float activity = uBurst * zone;
  float displacement = large * uCalmDisplacement * zone
    + activity * (large * uLargeDisplacement + medium * uMediumDisplacement)
    + fine * uJitter * (0.06 + activity)
    + tear * tearDirection * uTearStrength * uBurst;
  float shift = displacement * uStrength * uPixelRatio / uResolution.x;
  float split = uRgbSeparation * uStrength * uPixelRatio / uResolution.x
    * clamp(activity * 0.5 + abs(displacement) / 30.0 + tear * uBurst, 0.0, 1.5);
  float x = vUv.x + shift;
  // All samples keep exactly the same Y. The vertical line carrier is
  // evaluated at displaced source X, so the lines bend with the picture.
  vec3 color = vec3(crtRead(x + split, y).r, crtRead(x, y).g, crtRead(x - split, y).b);
  float amplitude = 1.0 - uAmplitudeVariation * activity * crtNoise(bandY * 61.0 + uSeed);
  // Blend the completed signal against the untouched scene at the original UV.
  // Both are linear; tone mapping and output conversion happen once after mixing.
  vec3 original = texture2D(tOriginal, vUv).rgb;
  gl_FragColor = vec4(mix(original, color * amplitude, uEffectOpacity), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function createAnalogCRT(renderer: THREE.WebGLRenderer) {
  const params: CRTParams = { ...DEFAULT_CRT }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.UnsignedByteType, colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    samples: 0, depthBuffer: true,
  })
  target.texture.name = 'AnalogCRT.finalFrame'
  const uniforms: Record<string, THREE.IUniform> = {
    tOriginal: { value: null }, uEffectOpacity: { value: 0.5 }, uCrtEnabled: { value: true },
    tFrame: { value: target.texture }, uResolution: { value: size },
    uLensCenter: { value: new THREE.Vector2() }, uLensSize: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uTime: { value: 0 }, uBurst: { value: 0 }, uSeed: { value: 1 },
  }
  const controls = ['strength', 'lineSpacing', 'lineStrength', 'lineIrregularity', 'calmDisplacement',
    'largeDisplacement', 'mediumDisplacement', 'jitter', 'rowStep', 'tearStrength', 'tearWidth',
    'rgbSeparation', 'amplitudeVariation'] as const
  for (const key of controls) uniforms['u' + key[0].toUpperCase() + key.slice(1)] = { value: params[key] }
  const material = new THREE.ShaderMaterial({
    name: 'Analog horizontal sync failure', uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    depthTest: false, depthWrite: false,
  })
  const quad = new FullScreenQuad(material)
  const signal = createSignalClock()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const resize = () => {
    renderer.getDrawingBufferSize(size)
    target.setSize(Math.max(1, size.x), Math.max(1, size.y))
    uniforms.uPixelRatio.value = renderer.getPixelRatio()
  }
  const render = (drawFrame: () => void, elapsed: number,
    window: { center: THREE.Vector2; size: number; active: boolean; originalTexture: THREE.Texture; opacity: number }) => {
    const state = signal(elapsed, params, reducedMotion.matches)
    if (!window.active) { drawFrame(); return }
    uniforms.uLensCenter.value.copy(window.center)
    uniforms.uLensSize.value = window.size
    uniforms.tOriginal.value = window.originalTexture
    uniforms.uEffectOpacity.value = THREE.MathUtils.clamp(window.opacity, 0, 1)
    uniforms.uCrtEnabled.value = params.enabled
    uniforms.uTime.value = reducedMotion.matches ? 0 : elapsed
    uniforms.uBurst.value = state.envelope
    uniforms.uSeed.value = state.seed
    for (const key of controls) uniforms['u' + key[0].toUpperCase() + key.slice(1)].value = params[key]
    const previousTarget = renderer.getRenderTarget()
    const autoClear = renderer.autoClear
    const scissor = renderer.getScissor(new THREE.Vector4())
    const scissorTest = renderer.getScissorTest()
    try {
      renderer.setRenderTarget(target)
      renderer.setScissorTest(false)
      renderer.autoClear = true
      drawFrame()
      renderer.setRenderTarget(previousTarget)
      renderer.setScissorTest(false)
      quad.render(renderer)
    } finally {
      renderer.setRenderTarget(previousTarget)
      renderer.autoClear = autoClear
      renderer.setScissor(scissor)
      renderer.setScissorTest(scissorTest)
    }
  }
  return { params, resize, render, dispose: () => { target.dispose(); material.dispose(); quad.dispose() } }
}
