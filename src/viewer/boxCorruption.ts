import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export const DEFAULT_CORRUPTION = {
  enabled: true, scanlineStrength: 0.16, bandCoverage: 0.22,
  bandOffsetStrength: 12, tearAmount: 0.3, rgbSplitAmount: 0.65,
  noiseAmount: 0, blendAmount: 0.7, animationSpeed: 1,
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
uniform vec2 uResolution;
uniform vec2 uSubjectY;
uniform float uPixelRatio;
uniform float uTime;
uniform float uScanlineStrength;
uniform float uBandCoverage;
uniform float uBandOffsetStrength;
uniform float uTearAmount;
uniform float uRgbSplitAmount;
uniform float uNoiseAmount;
uniform float uBlendAmount;
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
void main() {
  if (boxInterior(vUv) < 0.5 || uBlendAmount <= 0.0) discard;
  float y = clamp((vUv.y - uSubjectY.x) / max(uSubjectY.y - uSubjectY.x, 0.001), 0.0, 0.9999);
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
  float activity = band * pulse;
  if (activity < 0.001) discard;
  vec3 original = texture2D(tScene, vUv).rgb;
  float direction = boxHash(seed + 2.0) * 2.0 - 1.0;
  float strong = step(0.86, boxHash(state + 97.0));
  float row = floor(gl_FragCoord.y / max(uPixelRatio * 2.0, 1.0));
  float tear = step(0.76, boxHash(row + state)) * strong * uTearAmount;
  float shift = (direction * uBandOffsetStrength + tear * direction * 36.0)
    * pulse * uPixelRatio / uResolution.x;
  // Some strips compress their source X range into a stretched/duplicated row.
  float stretch = step(0.78, boxHash(seed + 8.0)) * 0.65 * pulse;
  float anchor = 0.3 + boxHash(seed + 10.0) * 0.4;
  float x = mix(vUv.x + shift, anchor + (vUv.x + shift - anchor) * 0.22, stretch);
  float split = uRgbSplitAmount * (0.25 + tear) * pulse * uPixelRatio / uResolution.x;
  vec3 effect = vec3(boxRead(vec2(x + split, vUv.y), original).r,
    boxRead(vec2(x, vUv.y), original).g, boxRead(vec2(x - split, vUv.y), original).b);
  float scan = 0.5 + 0.5 * cos(gl_FragCoord.y / uPixelRatio * 3.14159265);
  effect *= 1.0 - uScanlineStrength * scan;
  // Rare missing strips stay opaque, so they never reveal background geometry.
  float missing = step(0.94, boxHash(seed + 21.0));
  effect *= 1.0 - missing * 0.96;
  float grain = boxHash(gl_FragCoord.x + row * 157.0 + state * 919.0) - 0.5;
  effect = max(vec3(0.0), effect + grain * uNoiseAmount);
  gl_FragColor = vec4(mix(original, effect, activity * uBlendAmount), 1.0);
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
  const uniforms: Record<string, THREE.IUniform> = {
    tScene: { value: colorTarget.texture }, tMask: { value: maskTarget.texture },
    uResolution: { value: size }, uSubjectY: { value: new THREE.Vector2(0, 1) },
    uPixelRatio: { value: renderer.getPixelRatio() }, uTime: { value: 0 },
  }
  const keys = ['scanlineStrength', 'bandCoverage', 'bandOffsetStrength', 'tearAmount',
    'rgbSplitAmount', 'noiseAmount', 'blendAmount'] as const
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
    root.traverse(object => members.add(object))
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
  const bounds = new THREE.Box3()
  const corner = new THREE.Vector3()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let signalTime = 0.35
  let lastTime: number | undefined
  const render = (scene: THREE.Scene, camera: THREE.Camera, elapsed: number) => {
    const dt = lastTime === undefined ? 0 : Math.max(0, Math.min(elapsed - lastTime, 0.1))
    lastTime = elapsed
    if (!reducedMotion.matches) signalTime += dt * params.animationSpeed
    // Direct rendering retains the original antialiased outline and background.
    renderer.render(scene, camera)
    if (!params.enabled || params.blendAmount <= 0 || !subject) return
    bounds.setFromObject(subject)
    if (bounds.isEmpty()) return
    let minY = 1, maxY = 0
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z).project(camera)
      minY = Math.min(minY, corner.y * 0.5 + 0.5)
      maxY = Math.max(maxY, corner.y * 0.5 + 0.5)
    }
    uniforms.uSubjectY.value.set(Math.max(0, minY), Math.min(1, maxY))
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
  return { params, setSubject, resize, render, dispose: () => {
    clearMasks(); colorTarget.dispose(); maskTarget.dispose(); material.dispose(); quad.dispose()
  } }
}
