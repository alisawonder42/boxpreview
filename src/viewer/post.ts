import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
) {
  const size = renderer.getSize(new THREE.Vector2())
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  const gtao = new GTAOPass(scene, camera, size.x, size.y)
  gtao.blendIntensity = 1
  composer.addPass(gtao)

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0, 0.4, 0.9)
  composer.addPass(bloom)

  composer.addPass(new SMAAPass())
  composer.addPass(new OutputPass())

  const resize = (width: number, height: number) => {
    composer.setSize(width, height)
    gtao.setSize(width, height)
    bloom.setSize(width, height)
  }

  const setMeltBloom = (melt: number) => {
    bloom.strength = melt * 0.28
  }

  return { composer, resize, setMeltBloom, gtao }
}
