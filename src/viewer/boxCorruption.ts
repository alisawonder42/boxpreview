import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export const DEFAULT_CORRUPTION = {
  enabled: true, squareSize: 300, colorStrength: 0.8, colorDensity: 0.45, scanlineStrength: 0.16, bandCoverage: 0.22,
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
uniform sampler2D tDepth;
uniform mat4 uClipToObject;
uniform mat4 uObjectToClip;
uniform vec3 uObjectMin;
uniform vec3 uObjectSize;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform vec2 uSquareSize;
uniform float uColorStrength;
uniform float uColorDensity;
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
vec2 boxProject(vec3 position) {
  vec4 clip = uObjectToClip * vec4(position, 1.0);
  if (clip.w <= 0.0) return vec2(-1.0);
  return clip.xy / clip.w * 0.5 + 0.5;
}
void main() {
  // Both masks use the undistorted destination; sampling never moves the boundary.
  vec2 local = (vUv * uResolution - uPointer) / uSquareSize + 0.5;
  float cursorSquareMask = step(0.0, local.x) * step(local.x, 1.0)
    * step(0.0, local.y) * step(local.y, 1.0);
  float objectMask = boxMask(vUv);
  float finalMask = cursorSquareMask * objectMask;
  if (finalMask < 0.999 || boxInterior(vUv) < 0.5 || uBlendAmount <= 0.0) discard;
  // Reconstruct the visible surface in the subject root's own coordinates.
  // Cursor position affects only visibility, never the pattern or its sampling.
  float depth = texture2D(tDepth, vUv).x;
  vec4 surfaceH = uClipToObject * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 surface = surfaceH.xyz / surfaceH.w;
  vec3 p = (surface - uObjectMin) / uObjectSize;
  vec3 n = abs(normalize(cross(dFdx(surface), dFdy(surface))));
  // Box-aligned face coordinates: horizontal strips wrap onto the side and lid.
  vec3 horizontal = n.x > n.z && n.x > n.y ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  float surfaceX = dot(p, horizontal);
  float surfaceY = n.y > max(n.x, n.z) ? p.z : p.y;
  float y = clamp(surfaceY, 0.0, 0.9999);
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
  float row = floor(surfaceY * 150.0);
  float tear = step(0.76, boxHash(row + state)) * strong * uTearAmount;
  // Controls use nominal surface pixels (300 across a face), independent of zoom.
  float shift = (direction * uBandOffsetStrength + tear * direction * 36.0) * pulse / 300.0;
  float stretch = step(0.78, boxHash(seed + 8.0)) * 0.65 * pulse;
  float x = mix(surfaceX + shift, 0.5 + (surfaceX + shift - 0.5) * 0.22, stretch);
  float brokenRow = step(0.55, boxHash(row + state * 71.0));
  float split = uRgbSplitAmount * (0.25 + 2.0 * brokenRow + tear) * pulse / 300.0;
  vec3 samplePosition = surface + horizontal * uObjectSize * (x - surfaceX);
  vec3 splitVector = horizontal * uObjectSize * split;
  vec3 effect = vec3(boxRead(boxProject(samplePosition + splitVector), original).r,
    boxRead(boxProject(samplePosition), original).g,
    boxRead(boxProject(samplePosition - splitVector), original).b);
  float scanPhase = surfaceY * 300.0;
  float scan = (0.5 + 0.5 * cos(scanPhase * 3.14159265))
    * (1.0 - smoothstep(0.5, 2.0, fwidth(scanPhase)));
  effect *= 1.0 - uScanlineStrength * scan;
  // Short colored fragments, only in already damaged strips. Red is rare.
  float fragmentId = floor(surfaceX * 6.0);
  float colorSeed = row * 13.0 + fragmentId * 43.0 + state * 83.0;
  float colored = step(1.0 - uColorDensity, boxHash(colorSeed));
  float hue = boxHash(colorSeed + 19.0);
  vec3 accent = hue < 0.24 ? vec3(1.0, 0.01, 0.65)
    : hue < 0.48 ? vec3(0.01, 0.85, 1.0)
    : hue < 0.72 ? vec3(0.04, 1.0, 0.08)
    : hue < 0.94 ? vec3(0.03, 0.12, 1.0) : vec3(1.0, 0.015, 0.02);
  float sourceLight = dot(effect, vec3(0.2126, 0.7152, 0.0722));
  effect = mix(effect, accent * (0.35 + sourceLight * 0.65), colored * uColorStrength);
  // Rare missing strips stay opaque, so they never reveal background geometry.
  float missing = step(0.94, boxHash(seed + 21.0));
  effect *= 1.0 - missing * 0.96;
  float grain = boxHash(floor(surfaceX * 300.0) + row * 157.0 + state * 919.0) - 0.5;
  effect = max(vec3(0.0), effect + grain * uNoiseAmount);
  gl_FragColor = vec4(mix(original, effect, finalMask * activity * uBlendAmount), 1.0);
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
  maskTarget.depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType)
  const uniforms: Record<string, THREE.IUniform> = {
    tScene: { value: colorTarget.texture }, tMask: { value: maskTarget.texture },
    tDepth: { value: maskTarget.depthTexture },
    uClipToObject: { value: new THREE.Matrix4() }, uObjectToClip: { value: new THREE.Matrix4() },
    uObjectMin: { value: new THREE.Vector3() }, uObjectSize: { value: new THREE.Vector3(1, 1, 1) },
    uResolution: { value: size }, uPointer: { value: new THREE.Vector2() },
    uSquareSize: { value: new THREE.Vector2(300, 300) },
    uPixelRatio: { value: renderer.getPixelRatio() }, uTime: { value: 0 },
  }
  const keys = ['scanlineStrength', 'bandCoverage', 'bandOffsetStrength', 'tearAmount',
    'rgbSplitAmount', 'noiseAmount', 'blendAmount', 'colorStrength', 'colorDensity'] as const
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
    root.updateWorldMatrix(true, true)
    const rootInverse = root.matrixWorld.clone().invert()
    const bounds = new THREE.Box3()
    root.traverse(object => {
      members.add(object)
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.computeBoundingBox()
      if (object.geometry.boundingBox) bounds.union(object.geometry.boundingBox.clone()
        .applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld)))
    })
    if (!bounds.isEmpty()) {
      uniforms.uObjectMin.value.copy(bounds.min)
      bounds.getSize(uniforms.uObjectSize.value).max(new THREE.Vector3(0.0001, 0.0001, 0.0001))
    }
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
  const pointer = new THREE.Vector2()
  let pointerActive = false
  const setPointer = (x: number, y: number) => { pointer.set(x, y); pointerActive = true }
  const clearPointer = () => { pointerActive = false }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let signalTime = 0.35
  let lastTime: number | undefined
  const render = (scene: THREE.Scene, camera: THREE.Camera, elapsed: number) => {
    const dt = lastTime === undefined ? 0 : Math.max(0, Math.min(elapsed - lastTime, 0.1))
    lastTime = elapsed
    if (!reducedMotion.matches) signalTime += dt * params.animationSpeed
    // Direct rendering retains the original antialiased outline and background.
    renderer.render(scene, camera)
    if (!params.enabled || params.blendAmount <= 0 || !subject || !pointerActive) return
    subject.updateWorldMatrix(true, false)
    uniforms.uObjectToClip.value.copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse).multiply(subject.matrixWorld)
    uniforms.uClipToObject.value.copy(uniforms.uObjectToClip.value).invert()
    const rect = renderer.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const sx = size.x / rect.width, sy = size.y / rect.height
    uniforms.uPointer.value.set((pointer.x - rect.left) * sx, (rect.bottom ?? rect.top + rect.height) * sy - pointer.y * sy)
    uniforms.uSquareSize.value.set(params.squareSize * sx, params.squareSize * sy)
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
  return { params, setPointer, clearPointer, setSubject, resize, render, dispose: () => {
    clearMasks(); colorTarget.dispose(); maskTarget.dispose(); material.dispose(); quad.dispose()
  } }
}
