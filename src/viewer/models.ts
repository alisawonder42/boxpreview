import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createAnimalPrintTexture } from '../textures/animalPrint'
import { applyMeltMaterial, prepareMeltMesh, type MeltUniforms } from './melt'

export const FLOOR = 0

const SCAN_CANDIDATES = [
  './models/3DModel.fbx',
  './3DModel.fbx',
  'https://cdn.jsdelivr.net/gh/alisawonder42/boxpreview@main/3DModel.fbx',
]

function scanKind(url: string, fileName = '') {
  const name = `${fileName} ${url.split('?')[0]}`.toLowerCase()
  if (name.includes('.fbx')) return 'fbx'
  if (name.includes('.glb') || name.includes('.gltf')) return 'gltf'
  return 'unknown'
}

function sniffBuffer(buffer: ArrayBuffer) {
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(24, buffer.byteLength)))
  if (head.startsWith('Kaydara FBX') || head.includes('FBX')) return 'fbx'
  return 'gltf'
}

function textureBaseFor(url: string) {
  if (url.startsWith('blob:') || url.startsWith('data:')) return './models/'
  const slash = url.lastIndexOf('/')
  return slash >= 0 ? url.slice(0, slash + 1) : './models/'
}

function textureImageReady(map: THREE.Texture | null | undefined) {
  const image = map?.image as { width?: number; naturalWidth?: number } | undefined
  return Boolean(image && (image.width || image.naturalWidth))
}

export async function loadScanFromUrl(url: string, fileName = '') {
  const kind = scanKind(url, fileName)
  if (kind === 'unknown') {
    const buffer = await fetch(url).then((response) => response.arrayBuffer())
    return parseScanBuffer(buffer, sniffBuffer(buffer), './models/')
  }
  if (kind === 'fbx') {
    const base = textureBaseFor(url)
    const loader = new FBXLoader()
    loader.setResourcePath(base)
    const root = await loader.loadAsync(url)
    await ensureFbxTexture(root)
    return root
  }
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(url)
  return gltf.scene
}

async function parseScanBuffer(buffer: ArrayBuffer, kind: 'fbx' | 'gltf', base: string) {
  if (kind === 'fbx') {
    const root = new FBXLoader().parse(buffer, base)
    await ensureFbxTexture(root)
    return root
  }
  const gltf = await new GLTFLoader().parseAsync(buffer, base)
  return gltf.scene
}

async function ensureFbxTexture(root: THREE.Object3D) {
  const fallbacks = ['./models/3DModel.fbm/3DModel.jpg', './3DModel.fbm/3DModel.jpg']
  if (hasReadyMap(root)) return

  let texture: THREE.Texture | null = null
  for (const fallback of fallbacks) {
    try {
      texture = await new THREE.TextureLoader().loadAsync(fallback)
      break
    } catch {
      // try the next known KIRI sidecar path
    }
  }
  if (!texture) return

  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if ('map' in mat && !textureImageReady(mat.map as THREE.Texture | null)) {
        mat.map = texture
        mat.needsUpdate = true
      }
    }
  })
}

function hasReadyMap(root: THREE.Object3D) {
  let ready = false
  root.traverse((child) => {
    if (ready || !(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    ready = mats.some((mat) => 'map' in mat && textureImageReady(mat.map as THREE.Texture | null))
  })
  return ready
}

export async function findBundledScan() {
  for (const url of SCAN_CANDIDATES) {
    try {
      const root = await loadScanFromUrl(url)
      return { root, url }
    } catch {
      // try the next candidate
    }
  }
  return null
}

export function createStandInBox(uniforms: MeltUniforms) {
  const group = new THREE.Group()
  group.name = 'stand-in-box'
  const { map, bump } = createAnimalPrintTexture()

  const bodyMat = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.55,
    roughness: 0.9,
    metalness: 0,
    color: '#f3e6d2',
  })
  applyMeltMaterial(bodyMat, uniforms)

  const body = new THREE.Mesh(new RoundedBoxGeometry(1.28, 0.72, 0.86, 8, 0.045), bodyMat)
  body.position.y = 0.36
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const lid = new THREE.Mesh(new RoundedBoxGeometry(1.32, 0.16, 0.9, 8, 0.04), bodyMat)
  lid.position.y = 0.8
  lid.castShadow = true
  group.add(lid)

  const metal = new THREE.MeshPhysicalMaterial({
    color: '#b08a4a',
    metalness: 0.92,
    roughness: 0.22,
    envMapIntensity: 1.4,
  })
  const clasp = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.22, 0.05, 3, 0.012), metal)
  clasp.position.set(0, 0.7, 0.455)
  clasp.castShadow = true
  group.add(clasp)

  const footGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.08, 12)
  for (const [x, z] of [
    [-0.5, -0.3],
    [0.5, -0.3],
    [-0.5, 0.3],
    [0.5, 0.3],
  ] as const) {
    const foot = new THREE.Mesh(footGeo, metal)
    foot.position.set(x, 0.04, z)
    foot.castShadow = true
    group.add(foot)
  }

  return group
}

export function createGround() {
  const geo = new THREE.PlaneGeometry(18, 18)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#f6f1e8',
    roughness: 0.94,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.position.y = FLOOR
  return mesh
}

export function createPuddle(map: THREE.Texture | null) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 64),
    new THREE.MeshPhysicalMaterial({
      map: map ?? null,
      color: map ? '#ffffff' : '#c48a4a',
      roughness: 0.08,
      metalness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = FLOOR + 0.004
  mesh.receiveShadow = true
  mesh.visible = false
  return mesh
}

function meshBounds(object: THREE.Object3D) {
  const box = new THREE.Box3()
  object.updateMatrixWorld(true)
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) box.expandByObject(child)
  })
  return box
}

export function sitOnFloor(object: THREE.Object3D, top = FLOOR) {
  // KIRI FBX files sit far from the origin (cm-scale child + offset mesh).
  // Scale first, then recenter — scaling after a translate pivots around the
  // object's origin and throws the box into the fog.
  const box = meshBounds(object)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(longest) || longest < 1e-5) return

  object.scale.multiplyScalar(1.18 / longest)
  const seated = meshBounds(object)
  if (seated.isEmpty()) return
  const center = seated.getCenter(new THREE.Vector3())
  object.position.x += -center.x
  object.position.z += -center.z
  object.position.y += top - seated.min.y
}

export function prepareLoadedScan(root: THREE.Object3D, uniforms: MeltUniforms) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.visible = true
    child.geometry.computeVertexNormals()
    prepareMeltMesh(child, uniforms)
  })
  sitOnFloor(root)
}

export function firstAlbedo(root: THREE.Object3D) {
  let map: THREE.Texture | null = null
  root.traverse((child) => {
    if (map || !(child instanceof THREE.Mesh)) return
    const mat = Array.isArray(child.material) ? child.material[0] : child.material
    if (mat && 'map' in mat && mat.map instanceof THREE.Texture) map = mat.map
  })
  return map
}
