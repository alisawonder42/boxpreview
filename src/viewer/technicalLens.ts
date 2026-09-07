import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export type LensParams = {
  enabled: boolean
  lensSize: number
  roughness: number
  brightness: number
  sparkle: number
  grain: number
  interference: number
  animSpeed: number
}

export const DEFAULT_LENS: LensParams = {
  enabled: true, lensSize: 300, roughness: 0.32, brightness: 1.6,
  sparkle: 0.7, grain: 0.12, interference: 0.35, animSpeed: 0.6,
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tEmerald;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uLensSize;
uniform float uActive;
uniform float uTime;
uniform float uGrain;
uniform float uInterference;
varying vec2 vUv;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec3 color = texture2D(tScene, vUv).rgb;
  float distanceToSquare = max(abs(pixel.x-uPointer.x), abs(pixel.y-uPointer.y));
  float inside = (1.0-smoothstep(uLensSize*0.5-0.75, uLensSize*0.5+0.75, distanceToSquare))*uActive;
  if (inside > 0.0) {
    // Thin irregular bands, never a coarse sample grid. Keep offsets sub-pixel
    // most of the time so the silhouette and carvings stay registered.
    float tick = floor(uTime*9.0);
    float row = floor(pixel.y/2.0);
    float band = step(0.93, hash(vec2(row, tick)));
    float shift = (hash(vec2(row, tick+7.0))-0.5)*3.0*band*uInterference;
    vec2 uv = clamp(vUv+vec2(shift/uResolution.x, 0.0), vec2(0.0), vec2(1.0));
    vec3 metal = texture2D(tEmerald, uv).rgb;
    // A small highlight-only halo; no broad blur across the fine relief.
    vec2 px = 1.0/uResolution;
    vec3 glow = max(texture2D(tEmerald, uv+vec2(px.x,0.0)).rgb-0.8,0.0);
    glow += max(texture2D(tEmerald, uv-vec2(px.x,0.0)).rgb-0.8,0.0);
    glow += max(texture2D(tEmerald, uv+vec2(0.0,px.y)).rgb-0.8,0.0);
    glow += max(texture2D(tEmerald, uv-vec2(0.0,px.y)).rgb-0.8,0.0);
    metal += glow*0.045;
    float brokenLine = band * smoothstep(0.2,0.8,hash(vec2(floor(pixel.x/28.0),row)));
    metal *= 1.0-brokenLine*uInterference*0.55;
    metal *= 1.0 + (hash(pixel+tick)-0.5)*uGrain*2.0;
    color = mix(color, metal, inside);
  }
  gl_FragColor = vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** A second material pass through the SAME camera keeps the square registered. */
export function createTechnicalLens(renderer: THREE.WebGLRenderer) {
  const params = { ...DEFAULT_LENS }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  const makeTarget = () => new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, samples: 4,
  })
  const target = makeTarget()
  const emeraldTarget = makeTarget()
  target.texture.name = 'Lens.original'
  emeraldTarget.texture.name = 'Lens.emerald'
  const time = { value: 0 }
  const sparkle = { value: params.sparkle }
  const materials = new Map<THREE.Material, THREE.MeshPhysicalMaterial>()
  const pointerCss = new THREE.Vector2(-1, -1)
  let pointerActive = false
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  const emeraldFor = (source: THREE.Material) => {
    const cached = materials.get(source)
    if (cached) return cached
    const original = source as THREE.MeshStandardMaterial
    const mat = new THREE.MeshPhysicalMaterial({
      color: '#158765', metalness: 0.94, roughness: params.roughness,
      envMapIntensity: 2.8, clearcoat: 0.35, clearcoatRoughness: 0.24,
      // Retain authored fine relief, opacity, and cavity information.
      normalMap: original.normalMap ?? null, bumpMap: original.bumpMap ?? null,
      bumpScale: original.bumpScale ?? 1, aoMap: original.aoMap ?? null,
      aoMapIntensity: original.aoMapIntensity ?? 1,
      alphaMap: original.alphaMap ?? null, alphaTest: source.alphaTest,
      side: source.side, displacementMap: original.displacementMap ?? null,
      displacementScale: original.displacementScale ?? 1,
      displacementBias: original.displacementBias ?? 0,
    })
    if (original.normalScale) mat.normalScale.copy(original.normalScale)
    if (original.normalMapType !== undefined) mat.normalMapType = original.normalMapType
    mat.name = 'Emerald relief'
    mat.customProgramCacheKey = () => 'emerald-relief-v1'
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uEmeraldTime = time
      shader.uniforms.uSparkle = sparkle
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `
        #include <common>
        varying vec3 vSurfacePosition;
      `).replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vSurfacePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `)
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        #include <common>
        uniform float uEmeraldTime;
        uniform float uSparkle;
        varying vec3 vSurfacePosition;
        float surfaceHash(vec3 p) {
          p = fract(p*0.1031);
          p += dot(p,p.yzx+33.33);
          return fract((p.x+p.y)*p.z);
        }
      `).replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        // Fine flakes anchored to the scan, with a screen-space footprint
        // to prevent subpixel aliasing when the camera moves away.
        float footprint = max(length(fwidth(vSurfacePosition)), 0.00001);
        vec3 flakeCell = floor(vSurfacePosition * 240.0);
        float flakeVisibility = 1.0-smoothstep(0.003,0.012,footprint);
        float flake = surfaceHash(flakeCell);
        roughnessFactor = clamp(roughnessFactor+(flake-0.5)*0.12,0.16,0.6);
      `).replace('#include <opaque_fragment>', `
        // Broad directional reflections expose changes in the real normals.
        vec3 viewDirection = normalize(vViewPosition);
        vec3 mintLight = normalize(vec3(-0.65,0.7,0.9));
        vec3 goldLight = normalize(vec3(0.8,0.25,0.6));
        float mint = pow(max(dot(normal,normalize(mintLight+viewDirection)),0.0),22.0);
        float gold = pow(max(dot(normal,normalize(goldLight+viewDirection)),0.0),45.0);
        float grazing = pow(1.0-max(dot(normal,viewDirection),0.0),3.0);
        float twinkle = 0.55+0.45*sin(uEmeraldTime*1.5+flake*40.0);
        float glitter = smoothstep(0.78,0.99,flake)*twinkle*uSparkle*flakeVisibility;
        outgoingLight += vec3(0.035,0.48,0.33)*mint*0.7;
        outgoingLight += vec3(0.018,0.15,0.13)*grazing;
        outgoingLight += glitter*(vec3(0.4,1.0,0.72)*mint+vec3(1.0,0.85,0.3)*gold)*2.2;
        #include <opaque_fragment>
      `)
    }
    materials.set(source, mat)
    return mat
  }

  const uniforms = {
    tScene: { value: target.texture }, tEmerald: { value: emeraldTarget.texture },
    uResolution: { value: size.clone() }, uPointer: { value: new THREE.Vector2(-1e6,-1e6) },
    uLensSize: { value: params.lensSize }, uActive: { value: 0 },
    uTime: time, uGrain: { value: params.grain }, uInterference: { value: params.interference },
  }
  const material = new THREE.ShaderMaterial({
    name: 'Emerald square composite', uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    depthTest: false, depthWrite: false,
  })
  const quad = new FullScreenQuad(material)
  const syncSize = () => {
    renderer.getDrawingBufferSize(size)
    uniforms.uResolution.value.copy(size)
    const rect = renderer.domElement.getBoundingClientRect()
    const sx = size.x/Math.max(rect.width,1)
    const sy = size.y/Math.max(rect.height,1)
    uniforms.uLensSize.value = params.lensSize*sx
    uniforms.uPointer.value.set(pointerCss.x*sx,(rect.height-pointerCss.y)*sy)
  }
  const resize = () => {
    syncSize()
    target.setSize(size.x,size.y)
    emeraldTarget.setSize(size.x,size.y)
  }
  const setPointer = (x: number, y: number) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointerCss.set(x-rect.left,y-rect.top)
    syncSize()
  }
  const setPointerActive = (active: boolean) => { pointerActive = active }
  const render = (scene: THREE.Scene, camera: THREE.Camera, elapsed: number) => {
    const active = pointerActive && params.enabled
    // Avoid both offscreen passes while the lens is hidden.
    if (!active) { renderer.render(scene,camera); return }
    time.value = reducedMotion.matches ? 0 : elapsed*params.animSpeed
    sparkle.value = params.sparkle
    uniforms.uActive.value = 1
    uniforms.uGrain.value = params.grain
    uniforms.uInterference.value = params.interference
    syncSize()
    const previousTarget = renderer.getRenderTarget()
    const previousBackground = scene.background
    const previousShadowUpdate = renderer.shadowMap.autoUpdate
    const swapped: Array<[THREE.Mesh, THREE.Material | THREE.Material[]]> = []
    try {
      renderer.setRenderTarget(target)
      renderer.render(scene,camera)
      // Do not rebuild the same shadow map for the second material pass.
      renderer.shadowMap.autoUpdate = false
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const original = object.material
        swapped.push([object,original])
        object.material = Array.isArray(original) ? original.map(emeraldFor) : emeraldFor(original)
      })
      for (const mat of materials.values()) {
        mat.roughness = params.roughness
        mat.envMapIntensity = 1.75*params.brightness
      }
      scene.background = new THREE.Color('#06221c')
      renderer.setRenderTarget(emeraldTarget)
      renderer.render(scene,camera)
    } finally {
      for (const [mesh, original] of swapped) mesh.material = original
      scene.background = previousBackground
      renderer.shadowMap.autoUpdate = previousShadowUpdate
      renderer.setRenderTarget(previousTarget)
    }
    quad.render(renderer)
  }
  const dispose = () => {
    target.dispose(); emeraldTarget.dispose()
    for (const mat of materials.values()) mat.dispose()
    materials.clear(); material.dispose(); quad.dispose()
  }
  resize()
  return { params, render, setPointer, setPointerActive, resize, dispose }
}
