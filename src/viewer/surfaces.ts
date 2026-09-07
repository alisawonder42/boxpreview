import * as THREE from 'three'

const NOISE_GLSL = /* glsl */ `
float surfaceHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float surfaceNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = surfaceHash(i);
  float b = surfaceHash(i + vec2(1.0, 0.0));
  float c = surfaceHash(i + vec2(0.0, 1.0));
  float d = surfaceHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float surfaceFbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * surfaceNoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
`

export type DeskSurface = {
  material: THREE.MeshStandardMaterial
  uBaseColor: { value: THREE.Color }
  uGrainStrength: { value: number }
}

export function createDeskSurface(color: string, grain = 0.04): DeskSurface {
  const uBaseColor = { value: new THREE.Color(color) }
  const uGrainStrength = { value: grain }
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0,
  })
  material.customProgramCacheKey = () => 'desk-grain'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBaseColor = uBaseColor
    shader.uniforms.uGrainStrength = uGrainStrength
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vDeskWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\nvDeskWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vDeskWorldPos;\nuniform vec3 uBaseColor;\nuniform float uGrainStrength;\n${NOISE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
          float broadVariation = surfaceFbm(vDeskWorldPos.xz * 0.35);
          float fineGrain = surfaceNoise(vDeskWorldPos.xz * 170.0);
          vec3 warmTint = vec3(1.0, 0.985, 0.955);
          vec3 coolTint = vec3(0.975, 0.985, 1.0);
          vec3 grainColor = mix(uBaseColor * coolTint, uBaseColor * warmTint, broadVariation);
          grainColor += (fineGrain - 0.5) * uGrainStrength;
          diffuseColor.rgb = grainColor;`,
      )
  }
  return { material, uBaseColor, uGrainStrength }
}
