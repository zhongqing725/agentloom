import fs from 'node:fs'
import { chromium } from 'playwright-core'

const base = process.env.BASE || 'http://127.0.0.1:5173'
const outDir = '.screens/audit'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })

const longTaskProbe = `
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) })
    .observe({ entryTypes: ['longtask'], buffered: true });
`

const fpsProbe = `
  new Promise((resolve) => {
    let frames = 0; const t0 = performance.now(); let worst = 0; let last = t0;
    function tick() {
      const now = performance.now(); worst = Math.max(worst, now - last); last = now; frames++;
      if (now - t0 < 3000) requestAnimationFrame(tick)
      else resolve({ fps: +(frames / ((now - t0) / 1000)).toFixed(1), worstFrame: Math.round(worst) })
    }
    requestAnimationFrame(tick)
  })
`

async function auditDesktop() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))

  for (const path of ['/', '/workflow', '/team']) {
    await page.goto(base + path, { waitUntil: 'load' })
    await page.addInitScript(longTaskProbe).catch(() => {})
    await page.evaluate(longTaskProbe)
    await page.waitForTimeout(2500)
    const fps = await page.evaluate(fpsProbe)
    const longTasks = await page.evaluate(() => window.__lt || [])
    const counts = await page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas').length,
      blurElements: [...document.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el)
        return (s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none')
      }).length,
      animated: [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).animationName !== 'none').length,
    }))
    console.log(path.padEnd(12), 'fps=' + String(fps.fps).padEnd(6), 'worst=' + String(fps.worstFrame).padEnd(5),
      'longTasks=' + (longTasks.length ? longTasks.join(',') : '-'), JSON.stringify(counts))
  }
  if (errors.length) console.log('errors:', errors.slice(0, 3))
  await ctx.close()
}

async function auditMobile() {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  for (const path of ['/', '/workflow', '/knowledge', '/team', '/training', '/evals', '/plugins', '/runs/latest']) {
    await page.goto(base + path, { waitUntil: 'load' })
    await page.waitForTimeout(1800)
    const info = await page.evaluate(() => {
      const vw = window.innerWidth
      const scroller = document.scrollingElement
      const bad = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width < 8 || r.height < 8) continue
        const overRight = Math.round(r.right - vw)
        const overLeft = Math.round(-r.left)
        if (overRight > 2 || overLeft > 2) {
          const cls = typeof el.className === 'string' ? el.className.slice(0, 60) : ''
          bad.push({ tag: el.tagName.toLowerCase(), cls, overRight, overLeft, w: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 24) })
        }
      }
      return {
        vw,
        docScrollWidth: scroller ? scroller.scrollWidth : 0,
        docHeight: scroller ? scroller.scrollHeight : 0,
        overflowing: bad.sort((a, b) => (b.overRight + b.overLeft) - (a.overRight + a.overLeft)).slice(0, 6),
      }
    })
    const name = path === '/' ? 'home' : path.replace(/^\//, '').replace(/[/:]/g, '-')
    await page.screenshot({ path: `${outDir}/m-${name}.png`, fullPage: path === '/' })
    console.log(path.padEnd(16), 'vw=' + info.vw, 'scrollW=' + info.docScrollWidth, 'h=' + info.docHeight,
      info.docScrollWidth > info.vw ? 'HSCROLL' : 'ok')
    for (const o of info.overflowing) console.log('   ↳', `${o.tag}.${o.cls}`, `+${o.overRight}px right /${o.overLeft}px left`, `w=${o.w}`, JSON.stringify(o.text))
  }
  await ctx.close()
}

await (process.argv[2] === 'mobile' ? auditMobile() : auditDesktop())
await browser.close()
