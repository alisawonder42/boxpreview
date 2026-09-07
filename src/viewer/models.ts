import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createAnimalPrintTexture } from '../textures/animalPrint'
import { applyMeltMaterial, meltDepthMaterial, prepareMeltMesh, type MeltUniforms } from './melt'

export const FLOOR = 0

const SCAN_CANDIDATES = [
  './models/BoxModel.fbx',
  './BoxModel.fbx',
  'BoxModel.fbx',
  'https://cdn.jsdelivr.net/gh/alisawonder42/boxpreview@main/BoxModel.fbx',
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
  const existing = collectMaps(root)
  if (existing.length > 0) {
    await Promise.all(existing.map((map) => waitForTexture(map)))
    if (hasReadyMap(root)) return
  }

  const fallbacks = ['./models/3DModel.fbm/3DModel.jpg', './3DModel.fbm/3DModel.jpg']
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

  configureScanTexture(texture)
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

function collectMaps(root: THREE.Object3D) {
  const maps: THREE.Texture[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if ('map' in mat && mat.map instanceof THREE.Texture) maps.push(mat.map)
    }
  })
  return maps
}

function waitForTexture(map: THREE.Texture, ms = 8000) {
  if (textureImageReady(map)) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => finish(textureImageReady(map)), ms)
    const image = map.image as { complete?: boolean; naturalWidth?: number; addEventListener?: Function } | undefined
    if (image?.complete && image.naturalWidth) {
      finish(true)
      return
    }
    if (typeof image?.addEventListener === 'function') {
      image.addEventListener('load', () => finish(true), { once: true })
      image.addEventListener('error', () => finish(false), { once: true })
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
  const depth = meltDepthMaterial(uniforms)

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
  applyMeltMaterial(metal, uniforms)
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

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.customDepthMaterial = depth
  })

  return group
}

export const DESK_COLOR = '#e4dfd4'
export const WALL_COLOR = '#b9b8b4'

export function createGround() {
  const geo = new THREE.PlaneGeometry(6, 6)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshStandardMaterial({
    color: DESK_COLOR,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'desk'
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.position.y = FLOOR
  return mesh
}

export function fitDesk(mesh: THREE.Mesh, object: THREE.Object3D, multiple = 5) {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.z, 0.5)
  const dim = span * multiple
  mesh.geometry.dispose()
  const geo = new THREE.PlaneGeometry(dim, dim)
  geo.rotateX(-Math.PI / 2)
  mesh.geometry = geo
  const center = box.getCenter(new THREE.Vector3())
  mesh.position.set(center.x, FLOOR, center.z)
}

export function createWall() {
  const geo = new THREE.PlaneGeometry(48, 48)
  const mat = new THREE.MeshBasicMaterial({ color: WALL_COLOR })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'wall'
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.position.set(0, 24, -4)
  return mesh
}

export function fitWall(wall: THREE.Mesh, desk: THREE.Mesh) {
  desk.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(desk)
  if (box.isEmpty()) return
  const size = box.getSize(new THREE.Vector3())
  const width = Math.max(size.x * 8, 32)
  const height = Math.max(size.z * 10, 28)
  wall.geometry.dispose()
  wall.geometry = new THREE.PlaneGeometry(width, height)
  wall.position.set((box.min.x + box.max.x) * 0.5, height * 0.5, box.min.z - 0.04)
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

export function configureScanTexture(map: THREE.Texture, anisotropy = 8) {
  // Leave flipY alone. FBX/TextureLoader uses true; glTF uses false.
  // Forcing false on this KIRI atlas samples the wrong islands.
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = Math.max(map.anisotropy, anisotropy)
  map.generateMipmaps = true
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.magFilter = THREE.LinearFilter
  map.needsUpdate = true
}

export function prepareLoadedScan(
  root: THREE.Object3D,
  uniforms: MeltUniforms,
  anisotropy = 8,
) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.visible = true
    // KIRI writes reconstruction normals. Recomputing them on this
    // non-indexed mesh makes one flat normal per triangle — the "simplified" look.
    if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals()
    prepareMeltMesh(child, uniforms)
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if ('map' in mat && mat.map instanceof THREE.Texture) {
        configureScanTexture(mat.map, anisotropy)
      }
    }
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
