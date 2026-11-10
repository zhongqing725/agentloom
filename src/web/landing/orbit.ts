import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

/* ─────────────────────────────────────────────────────────────
   六环 · 液态金属
   Six chrome tubes in a gyroscope. The chrome is a pure mirror of a real
   photographic studio (HDRI), which is the only way to get the sharp
   highlights and black voids that read as liquid metal.
   ───────────────────────────────────────────────────────────── */

type Ring = {
  radius: number
  tube: number
  tilt: number
  azimuth: number
  roll: number
  spin: number
  speed: number
  wobble: number
  phase: number
  tint: number
  roughness: number
}

const HDRIS: Record<string, string> = {
  brown: './hdri/brownstudio.hdr',
}

const RINGS: Ring[] = [
  {
    radius: 1.0,
    tube: 0.092,
    tilt: 1.02,
    azimuth: 0.25,
    roll: 0.1,
    spin: 0,
    speed: 0.17,
    wobble: 0.1,
    phase: 0.2,
    tint: 0xffffff,
    roughness: 0.03,
  },
  {
    radius: 1.11,
    tube: 0.09,
    tilt: 1.3,
    azimuth: 1.3,
    roll: 0.55,
    spin: 0.4,
    speed: -0.13,
    wobble: 0.12,
    phase: 1.4,
    tint: 0xffffff,
    roughness: 0.04,
  },
  {
    radius: 1.22,
    tube: 0.091,
    tilt: 0.88,
    azimuth: 2.4,
    roll: -0.3,
    spin: -0.5,
    speed: 0.15,
    wobble: 0.09,
    phase: 2.5,
    tint: 0xffffff,
    roughness: 0.025,
  },
  {
    radius: 1.33,
    tube: 0.088,
    tilt: 1.18,
    azimuth: 3.5,
    roll: 0.2,
    spin: 0.15,
    speed: -0.11,
    wobble: 0.13,
    phase: 3.6,
    tint: 0xffffff,
    roughness: 0.035,
  },
  {
    radius: 1.44,
    tube: 0.092,
    tilt: 0.96,
    azimuth: 4.6,
    roll: -0.45,
    spin: -0.25,
    speed: 0.14,
    wobble: 0.11,
    phase: 4.7,
    tint: 0xffffff,
    roughness: 0.03,
  },
  {
    radius: 1.55,
    tube: 0.087,
    tilt: 1.36,
    azimuth: 5.6,
    roll: 0.7,
    spin: 0.45,
    speed: -0.09,
    wobble: 0.14,
    phase: 5.8,
    tint: 0xffffff,
    roughness: 0.045,
  },
]


export type OrbitHandle = { dispose: () => void }

export type OrbitOptions = {
  /** 0 kills the iridescent tint, leaving plain chrome. */
  iridescence?: number
  /** Drag to spin, with inertia. */
  interactive?: boolean
  /** Studio HDRI only: no pink/cyan gels, white key lights. */
  neutral?: boolean
}

export function startOrbit(canvas: HTMLCanvasElement, options: OrbitOptions = {}): OrbitHandle {
  const params = new URLSearchParams(window.location.search)
  const hdriPath = HDRIS[params.get('hdri') ?? 'brown'] ?? HDRIS.brown
  const iri = options.iridescence ?? (params.has('iri') ? Number(params.get('iri')) : 0.7)
  const interactive = options.interactive ?? false
  if (interactive) {
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'grab'
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()

  let disposed = false
  let env: THREE.Texture | null = null
  let cleanup: (() => void) | null = null

  new RGBELoader().load(
    hdriPath,
    (texture) => {
      if (disposed) return
      texture.mapping = THREE.EquirectangularReflectionMapping

      // bake the HDRI together with coloured gels, so the chrome mirrors a
      // real studio *and* the pink / cyan fringes of the reference
      const bake = new THREE.Scene()
      bake.background = texture

      const gel = (
        w: number,
        h: number,
        x: number,
        y: number,
        z: number,
        rgb: [number, number, number],
      ) => {
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: new THREE.Color(...rgb) }),
        )
        mesh.position.set(x, y, z)
        mesh.lookAt(0, 0, 0)
        bake.add(mesh)
      }
      if (!options.neutral) {
        gel(11, 6, -5.6, 3.6, 5.2, [7.5, 0.8, 5.2])
        gel(12, 8, 5.4, 1.6, 6.6, [0.5, 4.8, 8.5])
        gel(9, 5, 1.4, -5.6, 5.4, [5.0, 0.9, 7.0])
        gel(8, 8, -7.2, -1.2, 1.8, [0.3, 3.4, 6.4])
        gel(9, 9, 4.0, 6.0, -4.0, [4.4, 1.6, 6.2])
        gel(7, 7, -2.0, -6.4, -5.0, [1.2, 3.0, 5.6])
      }

      env = pmrem.fromScene(bake, 0, 0.1, 100).texture
      scene.environment = env
      bake.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry.dispose()
          ;(mesh.material as THREE.Material).dispose()
        }
      })
      texture.dispose()
      pmrem.dispose()
      cleanup = boot()
    },
    undefined,
    () => {
      if (disposed) return
      pmrem.dispose()
      cleanup = boot()
    },
  )

  function boot(): () => void {
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100)
    const cluster = new THREE.Group()
    cluster.scale.set(1.04, 0.96, 1)
    scene.add(cluster)

    const rings: Array<{ pivot: THREE.Group; mesh: THREE.Mesh; cfg: Ring }> = []

    const dropGeo = new THREE.SphereGeometry(1, 72, 48)
    const chrome = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 1,
      roughness: 0.02,
      envMapIntensity: 1,
    })
    for (let index = 0; index < RINGS.length; index++) {
      const cfg = RINGS[index]
      const geometry = new THREE.TorusGeometry(cfg.radius, cfg.tube, 40, 300)
      const material = new THREE.MeshPhysicalMaterial({
        color: cfg.tint,
        metalness: 1,
        roughness: cfg.roughness,
        envMapIntensity: 1,
        clearcoat: 0,
        iridescence: iri,
        iridescenceIOR: 1.4,
        iridescenceThicknessRange: [180, 420],
      })
      const mesh = new THREE.Mesh(geometry, material)


      const pivot = new THREE.Group()
      pivot.add(mesh)
      cluster.add(pivot)
      rings.push({ pivot, mesh, cfg })
    }

    // the sun at the centre, plus planets orbiting on their own planes
    const sun = new THREE.Mesh(dropGeo, chrome)
    sun.scale.setScalar(0.32)
    cluster.add(sun)

    // coloured fills: the pink / cyan fringe of the reference
    const warm = new THREE.PointLight(options.neutral ? 0xffffff : 0xff8fd0, options.neutral ? 30 : 26, 14, 2)
    warm.position.set(-3.2, 1.6, 2.6)
    scene.add(warm)
    const cool = new THREE.PointLight(options.neutral ? 0xe8f2ff : 0x7fd4ff, 24, 14, 2)
    cool.position.set(3.4, -1.2, 2.4)
    scene.add(cool)
    const top = new THREE.PointLight(0xffffff, 18, 14, 2)
    top.position.set(0.4, 4, 1.4)
    scene.add(top)

    // the six axes of an icosahedron -> six great circles, the classic
    // "atomic" arrangement; each ring precesses about another one's axis
    const PHI = (1 + Math.sqrt(5)) / 2
    const AXES = [
      new THREE.Vector3(0, 1, PHI),
      new THREE.Vector3(0, -1, PHI),
      new THREE.Vector3(1, PHI, 0),
      new THREE.Vector3(-1, PHI, 0),
      new THREE.Vector3(PHI, 0, 1),
      new THREE.Vector3(-PHI, 0, 1),
    ].map((v) => v.normalize())

    const Z = new THREE.Vector3(0, 0, 1)
    const baseQ = AXES.map((n) => new THREE.Quaternion().setFromUnitVectors(Z, n))
    const spinQ = new THREE.Quaternion()
    const outQ = new THREE.Quaternion()

    // one fundamental, harmonic ratios, alternating signs: calm, and it only
    // closes a full cycle after ~2.2 min
    const BASE_RATE = 0.05
    const RATES = [1, -1.25, 1.5, -1.75, 2, -2.25].map((k) => k * BASE_RATE)

    function orient(index: number, t: number, target: THREE.Quaternion) {
      const n = AXES[(index + 2) % AXES.length]
      spinQ.setFromAxisAngle(n, t * RATES[index])
      target.copy(spinQ).multiply(baseQ[index])
      return target
    }

    function layout() {
      const width = canvas.clientWidth || 580
      const height = canvas.clientHeight || 533
      const rect = canvas.getBoundingClientRect()
      const stageScale = rect.width ? rect.width / width : 1
      const dpr = Math.min((window.devicePixelRatio || 1) * stageScale, 1.75)
      renderer.setPixelRatio(dpr)
      renderer.setSize(width, height, false)

      camera.aspect = width / height
      camera.updateProjectionMatrix()

      const visibleHeight = 3.5
      const distance = visibleHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))
      camera.position.set(0, 0, distance)
      camera.lookAt(0, 0, 0)
    }

    layout()

    const frozen = params.has('freeze')
    const clock = new THREE.Clock()
    let elapsed = params.has('t') ? Number(params.get('t')) : 0
    let raf = 0
    let visible = true

    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true
    })
    io.observe(canvas)

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Drag to spin: pointer deltas become angular velocity, then decay.
    let dragX = 0
    let dragY = 0
    let velX = 0
    let velY = 0
    let dragging = false
    let lastX = 0
    let lastY = 0

    const onDown = (event: PointerEvent) => {
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
      velX = 0
      velY = 0
      canvas.style.cursor = 'grabbing'
      canvas.setPointerCapture?.(event.pointerId)
    }
    const onMove = (event: PointerEvent) => {
      if (!dragging) return
      velY += (event.clientX - lastX) * 0.006
      velX += (event.clientY - lastY) * 0.005
      lastX = event.clientX
      lastY = event.clientY
    }
    const onUp = (event: PointerEvent) => {
      dragging = false
      canvas.style.cursor = 'grab'
      canvas.releasePointerCapture?.(event.pointerId)
    }

    if (interactive) {
      canvas.addEventListener('pointerdown', onDown)
      canvas.addEventListener('pointermove', onMove)
      canvas.addEventListener('pointerup', onUp)
      canvas.addEventListener('pointercancel', onUp)
    }

    function frame() {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(clock.getDelta(), 0.05)
      if (!frozen && visible && !reduce) elapsed += dt
      const t = elapsed

      if (!dragging) {
        velX *= 0.95
        velY *= 0.95
        dragX += velX
        dragY += velY
      }

      cluster.rotation.y = t * 0.05 + dragY
      cluster.rotation.x = Math.sin(t * 0.17) * 0.11 - 0.02 + dragX
      cluster.rotation.z = Math.sin(t * 0.11 + 0.4) * 0.05

      for (let i = 0; i < rings.length; i++) {
        const { pivot } = rings[i]
        pivot.quaternion.copy(orient(i, t, outQ))
      }


      sun.rotation.y = t * 0.7
      sun.rotation.z = t * 0.35
      renderer.render(scene, camera)
    }

    frame()

    const onResize = () => layout()
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', onResize)
      if (interactive) {
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointermove', onMove)
        canvas.removeEventListener('pointerup', onUp)
        canvas.removeEventListener('pointercancel', onUp)
      }
      for (const { mesh } of rings) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
      dropGeo.dispose()
      env?.dispose()
      renderer.dispose()
    }
  }

  return {
    dispose() {
      disposed = true
      cleanup?.()
    },
  }
}
