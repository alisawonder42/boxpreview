import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createDeskSurface } from './surfaces'

export const FLOOR = 0
export const DESK_COLOR = '#e4dfd4'

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
    const image = map.image as {
      complete?: boolean
      naturalWidth?: number
      addEventListener?: (type: string, fn: () => void, opts?: { once: boolean }) => void
    } | undefined
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

function textureFrom(source: THREE.Material) {
  if ('map' in source && source.map instanceof THREE.Texture) return source.map
  return null
}

/**
 * Rest look that used to live on the melt materials at progress 0.
 * KIRI FBX meshes arrive as Phong/Lambert with a dark colour multiply and a
 * strong env response, which hides the print. Keep the box matte, multiply
 * the atlas at white, and lift the dark scan albedo so the pattern reads.
 */
function prepareScanMaterial(source: THREE.Material, anisotropy: number) {
  const map = textureFrom(source)
  if (map) configureScanTexture(map, anisotropy)

  const mat =
    source instanceof THREE.MeshPhysicalMaterial
      ? source.clone()
      : new THREE.MeshPhysicalMaterial({
          color: '#ffffff',
          map,
          roughness: 0.92,
          metalness: 0,
          clearcoat: 0,
          clearcoatRoughness: 0.4,
        })

  if (mat.map) {
    configureScanTexture(mat.map, anisotropy)
    mat.color.set('#ffffff')
  }
  mat.metalness = 0
  mat.roughness = Math.max(mat.roughness, 0.92)
  mat.envMapIntensity = 0.18
  mat.transparent = false
  mat.opacity = 1
  mat.depthWrite = true
  mat.depthTest = true
  mat.clearcoat = 0
  mat.clearcoatRoughness = 0.4
  mat.ior = 1.32
  mat.specularIntensity = 0.15
  mat.customProgramCacheKey = () => 'scan-albedo'
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
        diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.76)) * 1.03;`,
    )
  }
  mat.needsUpdate = true
  return mat
}

export function prepareLoadedScan(root: THREE.Object3D, anisotropy = 8) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.visible = true
    child.castShadow = true
    child.receiveShadow = true
    child.frustumCulled = true
    // KIRI writes reconstruction normals. Recomputing them on this
    // non-indexed mesh makes one flat normal per triangle.
    if (!child.geometry.getAttribute('normal')) child.geometry.computeVertexNormals()
    const sources = Array.isArray(child.material) ? child.material : [child.material]
    const next = sources.map((source) => prepareScanMaterial(source, anisotropy))
    child.material = next.length === 1 ? next[0] : next
  })
  sitOnFloor(root)
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
  // object's origin and throws the box off the desk.
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

export function createGround(grain = 0.04) {
  const geo = new THREE.PlaneGeometry(6, 6)
  geo.rotateX(-Math.PI / 2)
  const surface = createDeskSurface(DESK_COLOR, grain)
  const mesh = new THREE.Mesh(geo, surface.material)
  mesh.name = 'desk'
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.position.y = FLOOR
  mesh.userData.surface = surface
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
