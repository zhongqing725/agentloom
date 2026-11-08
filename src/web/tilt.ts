/**
 * Press-to-tilt cards: the card leans toward the contact point, a specular
 * highlight blooms under it, and a damped spring eases everything back on
 * release. Mounted once; cards opt in with `data-tilt`.
 */

const CARD = '[data-tilt]:not([data-tilt="off"])'

/* Spring: stiffness per 60 fps frame, damping applied per frame. */
const STIFFNESS = 0.18
const DAMPING = 0.74

export function installCardTilt() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  let card: HTMLElement | null = null
  let rect: DOMRect | null = null
  let max = 8
  let targetX = 0
  let targetY = 0
  let angleX = 0
  let angleY = 0
  let velocityX = 0
  let velocityY = 0
  let glowX = 50
  let glowY = 50
  let targetGlowX = 50
  let targetGlowY = 50
  let frame = 0
  let last = 0
  let pointerId: number | null = null

  const clear = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    pointerId = null
    if (card) {
      card.style.transform = ''
      card.style.removeProperty('--mx')
      card.style.removeProperty('--my')
      card.classList.remove('is-tilting', 'is-pressed')
    }
    card = null
    rect = null
    targetX = targetY = angleX = angleY = velocityX = velocityY = 0
    glowX = glowY = targetGlowX = targetGlowY = 50
  }

  const tick = (now: number) => {
    const dt = Math.min(2, Math.max(0.25, (now - last) / 16.667))
    last = now
    velocityX = (velocityX + (targetX - angleX) * STIFFNESS * dt) * Math.pow(DAMPING, dt)
    velocityY = (velocityY + (targetY - angleY) * STIFFNESS * dt) * Math.pow(DAMPING, dt)
    angleX += velocityX * dt
    angleY += velocityY * dt
    glowX += (targetGlowX - glowX) * Math.min(1, 0.3 * dt)
    glowY += (targetGlowY - glowY) * Math.min(1, 0.3 * dt)
    if (!card) {
      frame = 0
      return
    }
    card.style.transform = `perspective(1100px) rotateX(${angleY.toFixed(2)}deg) rotateY(${angleX.toFixed(2)}deg)`
    card.style.setProperty('--mx', `${glowX.toFixed(1)}%`)
    card.style.setProperty('--my', `${glowY.toFixed(1)}%`)
    const settled =
      pointerId === null &&
      Math.abs(angleX) + Math.abs(angleY) < 0.04 &&
      Math.abs(velocityX) + Math.abs(velocityY) < 0.04
    if (settled) {
      clear()
      return
    }
    frame = requestAnimationFrame(tick)
  }

  const start = () => {
    last = performance.now()
    if (!frame) frame = requestAnimationFrame(tick)
  }

  const pointAt = (clientX: number, clientY: number) => {
    if (!rect) return
    const nx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const ny = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    targetGlowX = nx * 100
    targetGlowY = ny * 100
    targetX = (nx - 0.5) * 2 * max
    targetY = -(ny - 0.5) * 2 * max
  }

  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (pointerId !== null) return
    const target = event.target instanceof Element ? event.target : null
    if (!target || target.closest('input, textarea, select, [contenteditable], [role="slider"], [role="textbox"]')) return
    const next = target.closest<HTMLElement>(CARD)
    if (!next) return
    clear()
    card = next
    rect = next.getBoundingClientRect()
    max = rect.width > 720 ? 4 : rect.width > 460 ? 6 : 8
    pointerId = event.pointerId
    next.classList.add('is-tilting', 'is-pressed')
    pointAt(event.clientX, event.clientY)
    glowX = targetGlowX
    glowY = targetGlowY
    start()
  }

  const onMove = (event: PointerEvent) => {
    if (pointerId === null || event.pointerId !== pointerId) return
    pointAt(event.clientX, event.clientY)
  }

  const onUp = (event: PointerEvent) => {
    if (pointerId === null || event.pointerId !== pointerId) return
    pointerId = null
    targetX = targetY = 0
    card?.classList.remove('is-pressed')
  }

  const onScroll = () => {
    if (card && pointerId !== null) rect = card.getBoundingClientRect()
  }

  document.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  window.addEventListener('blur', clear)
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })

  return () => {
    document.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('blur', clear)
    window.removeEventListener('scroll', onScroll, true)
    clear()
  }
}
