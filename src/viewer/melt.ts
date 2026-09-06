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
}

export function createMeltUniforms(): MeltUniforms {
  return {
    uMelt: { value: 0 },
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBoundsMin: { value: new THREE.Vector3(-0.5, 0, -0.5) },
    uBoundsMax: { value: new THREE.Vector3(0.5, 1, 0.5) },
    uLift: { value: 1.03 },
    uGamma: { value: 0.76 },
  }
}

export function applyMeltMaterial(
  material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
  uniforms: MeltUniforms,
) {
  // Photogrammetry albedo already has the capture lighting in it.
  if ('roughness' in material) {
    material.userData.originalRoughness = material.roughness
    material.userData.originalMetalness = material.metalness
    material.userData.originalEnv = material.envMapIntensity
    if (material.map) {
      material.metalness = 0
      material.roughness = Math.max(material.roughness, 0.92)
      material.envMapIntensity = 0
    }
  }
  if (material.map) material.color.set('#ffffff')
  material.needsUpdate = true

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMelt = uniforms.uMelt
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uCenter = uniforms.uCenter
    shader.uniforms.uBoundsMin = uniforms.uBoundsMin
    shader.uniforms.uBoundsMax = uniforms.uBoundsMax
    shader.uniforms.uLift = uniforms.uLift
    shader.uniforms.uGamma = uniforms.uGamma

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uMelt;
        uniform float uTime;
        uniform vec3 uCenter;
        uniform vec3 uBoundsMin;
        uniform vec3 uBoundsMax;
        ${NOISE}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float melt = saturate(uMelt);
          vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
          float span = max(0.0001, uBoundsMax.y - uBoundsMin.y);
          float height01 = saturate((world.y - uBoundsMin.y) / span);
          float n = snoise(world * 3.1 + vec3(0.0, uTime * 0.55, 0.0));
          float n2 = snoise(world * 6.4 + 19.0 + uTime * 0.2);
          float sag = smoothstep(0.0, 0.38, melt);
          float flatten = smoothstep(0.18, 0.72, melt);
          float drain = smoothstep(0.52, 1.0, melt);
          float floorY = uBoundsMin.y;
          world.y = mix(world.y, floorY + 0.02 + n * 0.03, sag * (0.25 + 0.75 * height01));
          world.y = mix(world.y, floorY + 0.008 + abs(n) * 0.02, flatten);
          vec2 from = world.xz - uCenter.xz;
          world.xz = uCenter.xz + from * mix(1.0, 2.15 + n * 0.35, flatten);
          world.xz += vec2(n, n2) * flatten * 0.1 * span;
          vec2 away = from;
          float awayLen = length(away);
          away = awayLen > 0.0001 ? away / awayLen : vec2(0.42, -0.18);
          world.xz += away * drain * (1.15 + n2 * 0.28);
          world.y -= drain * (0.16 + 0.4 * awayLen);
          transformed = (inverse(modelMatrix) * vec4(world, 1.0)).xyz;
        }`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uMelt;
        uniform float uLift;
        uniform float uGamma;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.08, saturate(uMelt));`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(uGamma)) * uLift;
        diffuseColor.a *= 1.0 - smoothstep(0.58, 0.96, saturate(uMelt));`,
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
      source instanceof THREE.MeshStandardMaterial
        ? source.clone()
        : new THREE.MeshStandardMaterial({
            color: '#ffffff',
            map,
            roughness: 0.92,
            metalness: 0,
          })
    applyMeltMaterial(mat, uniforms)
    return mat
  })
  mesh.material = next.length === 1 ? next[0] : next
  mesh.castShadow = true
  mesh.receiveShadow = true
}

export function bindMeltBounds(root: THREE.Object3D, uniforms: MeltUniforms) {
  const box = new THREE.Box3().setFromObject(root)
  box.getCenter(uniforms.uCenter.value)
  uniforms.uBoundsMin.value.copy(box.min)
  uniforms.uBoundsMax.value.copy(box.max)
}

export function setMeltLook(root: THREE.Object3D, melt: number) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue
      const baseRough = (mat.userData.originalRoughness as number | undefined) ?? 0.88
      mat.roughness = THREE.MathUtils.lerp(Math.max(baseRough, 0.88), 0.08, melt)
      mat.envMapIntensity = THREE.MathUtils.lerp(0, 0.7, melt)
      mat.metalness = 0
      mat.transparent = melt > 0.45
      mat.opacity = 1 - THREE.MathUtils.smoothstep(0.58, 0.96, melt)
      mat.depthWrite = melt < 0.72
    }
  })
}
