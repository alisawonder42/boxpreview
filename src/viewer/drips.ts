import * as THREE from 'three'
import { FLOOR } from './models'

type Drop = {
  seed: number
  delay: number
  x: number
  z: number
  speed: number
}

export function createDrips(map: THREE.Texture | null, count = 72) {
  const geo = new THREE.SphereGeometry(0.028, 14, 12)
  geo.scale(0.72, 1.55, 0.72)
  const mat = new THREE.MeshPhysicalMaterial({
    map: map ?? null,
    color: map ? '#ffffff' : '#c48a4a',
    roughness: 0.06,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 1,
  })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.castShadow = true
  mesh.visible = false

  const dummy = new THREE.Object3D()
  const drops: Drop[] = Array.from({ length: count }, (_, i) => ({
    seed: i * 17.13,
    delay: (i % 12) / 14,
    x: Math.cos(i * 2.399) * (0.12 + (i % 7) * 0.04),
    z: Math.sin(i * 1.618) * (0.1 + (i % 5) * 0.04),
    speed: 0.85 + (i % 5) * 0.12,
  }))

  const update = (melt: number, time: number, origin: THREE.Vector3) => {
    const active = melt > 0.1 && melt < 0.92
    mesh.visible = active
    if (!active) return
    mat.opacity = 1 - THREE.MathUtils.smoothstep(0.62, 0.9, melt)
    mat.transparent = melt > 0.55

    for (let i = 0; i < count; i++) {
      const drop = drops[i]
      const local = Math.max(0, melt - drop.delay * 0.35)
      const fall = (local * drop.speed + time * 0.22 * local) % 1
      const slide = THREE.MathUtils.smoothstep(0.5, 1, melt)
      dummy.position.set(
        origin.x + drop.x * (0.8 + melt * 1.4) + slide * 0.7,
        origin.y - fall * (0.7 + melt * 0.55),
        origin.z + drop.z * (0.8 + melt * 1.4) - slide * 0.35,
      )
      const squash = THREE.MathUtils.lerp(1, 1.85, fall)
      dummy.scale.setScalar(THREE.MathUtils.lerp(1, 0.35, slide))
      dummy.scale.x /= squash
      dummy.scale.z /= squash
      dummy.scale.y *= squash
      dummy.rotation.set(0, drop.seed, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  const setMap = (next: THREE.Texture | null) => {
    mat.map = next
    mat.needsUpdate = true
  }

  return { mesh, update, setMap, originY: FLOOR + 0.42 }
}
