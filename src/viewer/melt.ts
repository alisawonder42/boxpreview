import * as THREE from 'three'

const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

export type MeltUniforms = {
  uMelt: { value: number }
  uTime: { value: number }
  uCenter: { value: THREE.Vector3 }
  uBoundsMin: { value: THREE.Vector3 }
  uBoundsMax: { value: THREE.Vector3 }
  uLift: { value: number }
  uGamma: { value: number }
  uSagEnd: { value: number }
  uFlattenStart: { value: number }
  uFlattenEnd: { value: number }
  uDrainStart: { value: number }
  uDrainEnd: { value: number }
  uFadeStart: { value: number }
  uFadeEnd: { value: number }
  uSpread: { value: number }
  uDrainTravel: { value: number }
  uTourOffset: { value: THREE.Vector3 }
  uBlobHeight: { value: number }
  uBlobPlump: { value: number }
  uBlobLobes: { value: number }
  uBlobSpeed: { value: number }
  uBlobRadius: { value: number }
  uBlobFreq: { value: number }
}

/** Live timing for the melt. Stages are 0–1 windows along melt progress. */
export type MeltAnim = {
  meltIn: number
  meltOut: number
  ease: number
  sagEnd: number
  flattenStart: number
  flattenEnd: number
  drainStart: number
  drainEnd: number
  fadeStart: number
  fadeEnd: number
  spread: number
  drainTravel: number
  blobHeight: number
  blobPlump: number
  blobLobes: number
  blobSpeed: number
  blobRadius: number
  blobFreq: number
  blobGloss: number
  blobClearcoat: number
  puddleInStart: number
  puddleInEnd: number
  puddleOutStart: number
  puddleOutEnd: number
  progress: number
  scrubbing: boolean
}

export function createMeltAnim(): MeltAnim {
  return {
    meltIn: 0.42,
    meltOut: 2.4,
    ease: 1.22,
    sagEnd: 0.38,
    flattenStart: 0.1,
    flattenEnd: 0.64,
    drainStart: 1,
    drainEnd: 1,
    fadeStart: 1,
    fadeEnd: 1,
    spread: 1.12,
    drainTravel: 0,
    blobHeight: 0.48,
    blobPlump: 1.35,
    blobLobes: 0.34,
    blobSpeed: 0.55,
    blobRadius: 0.4,
    blobFreq: 1.85,
    blobGloss: 0.92,
    blobClearcoat: 1,
    puddleInStart: 0.1,
    puddleInEnd: 0.58,
    puddleOutStart: 0.6,
    puddleOutEnd: 0.93,
    progress: 0,
    scrubbing: false,
  }
}

export function createMeltUniforms(): MeltUniforms {
  const anim = createMeltAnim()
  return {
    uMelt: { value: 0 },
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBoundsMin: { value: new THREE.Vector3(-0.5, 0, -0.5) },
    uBoundsMax: { value: new THREE.Vector3(0.5, 1, 0.5) },
    uLift: { value: 1.03 },
    uGamma: { value: 0.76 },
    uSagEnd: { value: anim.sagEnd },
    uFlattenStart: { value: anim.flattenStart },
    uFlattenEnd: { value: anim.flattenEnd },
    uDrainStart: { value: anim.drainStart },
    uDrainEnd: { value: anim.drainEnd },
    uFadeStart: { value: anim.fadeStart },
    uFadeEnd: { value: anim.fadeEnd },
    uSpread: { value: anim.spread },
    uDrainTravel: { value: anim.drainTravel },
    uTourOffset: { value: new THREE.Vector3() },
    uBlobHeight: { value: anim.blobHeight },
    uBlobPlump: { value: anim.blobPlump },
    uBlobLobes: { value: anim.blobLobes },
    uBlobSpeed: { value: anim.blobSpeed },
    uBlobRadius: { value: anim.blobRadius },
    uBlobFreq: { value: anim.blobFreq },
  }
}

export function applyMeltAnim(uniforms: MeltUniforms, anim: MeltAnim) {
  uniforms.uSagEnd.value = anim.sagEnd
  uniforms.uFlattenStart.value = anim.flattenStart
  uniforms.uFlattenEnd.value = anim.flattenEnd
  uniforms.uDrainStart.value = anim.drainStart
  uniforms.uDrainEnd.value = anim.drainEnd
  uniforms.uFadeStart.value = anim.fadeStart
  uniforms.uFadeEnd.value = anim.fadeEnd
  uniforms.uSpread.value = anim.spread
  uniforms.uDrainTravel.value = anim.drainTravel
  uniforms.uBlobHeight.value = anim.blobHeight
  uniforms.uBlobPlump.value = anim.blobPlump
  uniforms.uBlobLobes.value = anim.blobLobes
  uniforms.uBlobSpeed.value = anim.blobSpeed
  uniforms.uBlobRadius.value = anim.blobRadius
  uniforms.uBlobFreq.value = anim.blobFreq
}

export function visualMelt(progress: number, ease: number) {
  return Math.pow(THREE.MathUtils.clamp(progress, 0, 1), Math.max(0.2, ease))
}

const MELT_VERTEX_UNIFORMS = /* glsl */ `
uniform float uMelt;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
uniform float uSagEnd;
uniform float uFlattenStart;
uniform float uFlattenEnd;
uniform float uDrainStart;
uniform float uDrainEnd;
uniform float uSpread;
uniform float uDrainTravel;
uniform vec3 uTourOffset;
uniform float uBlobHeight;
uniform float uBlobPlump;
uniform float uBlobLobes;
uniform float uBlobSpeed;
uniform float uBlobRadius;
uniform float uBlobFreq;
${NOISE}

vec3 applyBlob(vec3 world) {
  float melt = saturate(uMelt);
  float sag = smoothstep(0.0, max(0.001, uSagEnd), melt);
  float form = smoothstep(uFlattenStart, max(uFlattenStart + 0.001, uFlattenEnd), melt);
  float floorY = uBoundsMin.y;

  float n = snoise(vec3(world.x * uBlobFreq, uTime * uBlobSpeed, world.z * uBlobFreq));
  float n2 = snoise(vec3(world.z * uBlobFreq * 1.65 + 6.0, uTime * uBlobSpeed * 0.52, world.x * uBlobFreq * 1.2));
  float lobe = n * 0.68 + n2 * 0.32;

  vec3 slumped = world;
  slumped.y = mix(world.y, floorY + 0.16 + n * 0.05, sag * 0.7);

  vec3 c = vec3(uCenter.x, floorY + uBlobHeight * 0.48, uCenter.z);
  vec3 rel = world - c;
  float len = length(rel);
  vec3 dir = len > 0.0001 ? rel / len : vec3(0.0, 1.0, 0.0);

  float fat = mix(0.42, 1.18, saturate(uBlobPlump * 0.55));
  float rx = uBlobRadius * uSpread * (1.0 + lobe * uBlobLobes) * fat;
  float rz = uBlobRadius * uSpread * (1.0 - lobe * uBlobLobes * 0.55) * fat;
  float ry = uBlobHeight * mix(0.55, 1.15, saturate(uBlobPlump * 0.5));

  vec3 onSurf = c + dir * vec3(rx, ry, rz);
  onSurf += vec3(n, abs(n2), n2) * (uBlobLobes * 0.08 * uBlobHeight);
  onSurf.y = max(onSurf.y, floorY + 0.028);
  onSurf.y += max(0.0, dir.y) * uBlobHeight * 0.16 * form;

  return mix(slumped, onSurf, form) + uTourOffset;
}
`

const MELT_VERTEX_BODY = /* glsl */ `
{
  vec3 world = applyBlob((modelMatrix * vec4(position, 1.0)).xyz);
  transformed = (inverse(modelMatrix) * vec4(world, 1.0)).xyz;
}
`

const MELT_NORMAL_BODY = /* glsl */ `
{
  float melt = saturate(uMelt);
  float form = smoothstep(uFlattenStart, max(uFlattenStart + 0.001, uFlattenEnd), melt);
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 blob = applyBlob(world);
  float e = 0.018;
  vec3 bx = applyBlob(world + vec3(e, 0.0, 0.0));
  vec3 bz = applyBlob(world + vec3(0.0, 0.0, e));
  vec3 bn = normalize(cross(bz - blob, bx - blob));
  if (bn.y < 0.0) bn *= -1.0;
  vec3 worldN = mix(normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz), bn, form);
  objectNormal = normalize((inverse(modelMatrix) * vec4(worldN, 0.0)).xyz);
}
`

type ShaderWithUniforms = {
  uniforms: Record<string, { value: unknown }>
  vertexShader: string
  fragmentShader?: string
}

function bindMeltShaderUniforms(shader: ShaderWithUniforms, uniforms: MeltUniforms) {
  shader.uniforms.uMelt = uniforms.uMelt
  shader.uniforms.uTime = uniforms.uTime
  shader.uniforms.uCenter = uniforms.uCenter
  shader.uniforms.uBoundsMin = uniforms.uBoundsMin
  shader.uniforms.uBoundsMax = uniforms.uBoundsMax
  shader.uniforms.uLift = uniforms.uLift
  shader.uniforms.uGamma = uniforms.uGamma
  shader.uniforms.uSagEnd = uniforms.uSagEnd
  shader.uniforms.uFlattenStart = uniforms.uFlattenStart
  shader.uniforms.uFlattenEnd = uniforms.uFlattenEnd
  shader.uniforms.uDrainStart = uniforms.uDrainStart
  shader.uniforms.uDrainEnd = uniforms.uDrainEnd
  shader.uniforms.uFadeStart = uniforms.uFadeStart
  shader.uniforms.uFadeEnd = uniforms.uFadeEnd
  shader.uniforms.uSpread = uniforms.uSpread
  shader.uniforms.uDrainTravel = uniforms.uDrainTravel
  shader.uniforms.uTourOffset = uniforms.uTourOffset
  shader.uniforms.uBlobHeight = uniforms.uBlobHeight
  shader.uniforms.uBlobPlump = uniforms.uBlobPlump
  shader.uniforms.uBlobLobes = uniforms.uBlobLobes
  shader.uniforms.uBlobSpeed = uniforms.uBlobSpeed
  shader.uniforms.uBlobRadius = uniforms.uBlobRadius
  shader.uniforms.uBlobFreq = uniforms.uBlobFreq
}

function injectMeltVertex(shader: ShaderWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      ${MELT_VERTEX_UNIFORMS}`,
    )
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      ${MELT_NORMAL_BODY}`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      ${MELT_VERTEX_BODY}`,
    )
}

const depthMaterials = new WeakMap<MeltUniforms, THREE.MeshDepthMaterial>()

export function meltDepthMaterial(uniforms: MeltUniforms) {
  const existing = depthMaterials.get(uniforms)
  if (existing) return existing
  const mat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  })
  mat.onBeforeCompile = (shader) => {
    bindMeltShaderUniforms(shader, uniforms)
    injectMeltVertex(shader)
  }
  depthMaterials.set(uniforms, mat)
  return mat
}

export function applyMeltMaterial(
  material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
  uniforms: MeltUniforms,
) {
  if ('roughness' in material) {
    material.userData.originalRoughness = material.roughness
    material.userData.originalMetalness = material.metalness
    material.userData.originalEnv = material.envMapIntensity
    if (material.map) {
      material.metalness = 0
      material.roughness = Math.max(material.roughness, 0.92)
      material.envMapIntensity = 0.2
    }
  }
  if (material.map) material.color.set('#ffffff')
  material.needsUpdate = true

  material.onBeforeCompile = (shader) => {
    bindMeltShaderUniforms(shader, uniforms)
    injectMeltVertex(shader)

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uMelt;
        uniform float uLift;
        uniform float uGamma;
        uniform float uFadeStart;
        uniform float uFadeEnd;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(uGamma)) * uLift;`
      )
  }
}

function textureFrom(source: THREE.Material) {
  if ('map' in source && source.map instanceof THREE.Texture) {
    return source.map
  }
  return null
}

export function prepareMeltMesh(mesh: THREE.Mesh, uniforms: MeltUniforms) {
  const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const next = sources.map((source) => {
    const map = textureFrom(source)
    const mat =
      source instanceof THREE.MeshPhysicalMaterial
        ? source.clone()
        : new THREE.MeshPhysicalMaterial({
            color: '#ffffff',
            map,
            roughness: 0.92,
            metalness: 0,
            clearcoat: 0,
            clearcoatRoughness: 0.35,
          })
    applyMeltMaterial(mat, uniforms)
    return mat
  })
  mesh.material = next.length === 1 ? next[0] : next
  mesh.customDepthMaterial = meltDepthMaterial(uniforms)
  mesh.castShadow = true
  mesh.receiveShadow = true
}

export function bindMeltBounds(root: THREE.Object3D, uniforms: MeltUniforms) {
  const box = new THREE.Box3().setFromObject(root)
  box.getCenter(uniforms.uCenter.value)
  uniforms.uBoundsMin.value.copy(box.min)
  uniforms.uBoundsMax.value.copy(box.max)
}

export function setMeltLook(root: THREE.Object3D, melt: number, _uniforms: MeltUniforms, anim?: MeltAnim) {
  const gloss = anim?.blobGloss ?? 0.9
  const coat = anim?.blobClearcoat ?? 1
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.visible = true
    child.castShadow = melt < 0.08
    child.receiveShadow = melt < 0.2
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue
      const baseRough = (mat.userData.originalRoughness as number | undefined) ?? 0.9
      mat.roughness = THREE.MathUtils.lerp(Math.max(baseRough, 0.88), THREE.MathUtils.lerp(0.28, 0.04, gloss), melt)
      mat.envMapIntensity = THREE.MathUtils.lerp(0.18, THREE.MathUtils.lerp(0.45, 1.45, gloss), melt)
      mat.metalness = 0
      mat.transparent = false
      mat.opacity = 1
      mat.depthWrite = true
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.clearcoat = THREE.MathUtils.lerp(0, coat, melt)
        mat.clearcoatRoughness = THREE.MathUtils.lerp(0.4, 0.06, melt)
        mat.ior = 1.32
        mat.specularIntensity = THREE.MathUtils.lerp(0.15, 1, melt)
      }
    }
  })
}
