/**
 * White-flash / unstyled-overlay audit.
 *
 * Opens the home page N times in cold contexts at phone and desktop sizes,
 * then fails if the rendered page contains a large near-white surface, a
 * stuck boot screen, or a non-dark document background. Run against the
 * deployed URL (default) or a local build:
 *
 *   RUNS=100 node scripts/audit-white.mjs
 *   BASE=http://127.0.0.1:8899 RUNS=20 node scripts/audit-white.mjs
 *
 * For the 10k-open requirement: RUNS=10000, VIEWPORT=both. It is a real
 * browser loop, so it takes hours; that is the point. A quick smoke run is
 * the default.
 */
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const base = process.env.BASE || 'http://103.68.192.80'
const runs = Math.max(1, Number(process.env.RUNS || 20))
const which = process.env.VIEWPORT || 'both'
const outDir = '.screens/audit-white'
fs.mkdirSync(outDir, { recursive: true })

const profiles = [
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
].filter((p) => which === 'both' || which === p.name)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
let failures = 0

function dark(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return false
  return (+m[1] + +m[2] + +m[3]) / 3 < 24
}

for (const profile of profiles) {
  let passed = 0
  for (let i = 0; i < runs; i += 1) {
    const ctx = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      // A cold context is the difference between "works in my tab" and the
      // actual first-open experience on a phone.
      storageState: undefined,
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error).slice(0, 180)))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push('[console] ' + message.text().slice(0, 180))
    })

    try {
      await page.goto(base + '/', { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(900)
      const result = await page.evaluate(() => {
        const vw = innerWidth
        const vh = innerHeight
        const bad = []
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('#boot')) continue
          const r = el.getBoundingClientRect()
          if (r.width * r.height < vw * vh * 0.04) continue
          const s = getComputedStyle(el)
          if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) continue
          const bg = s.backgroundColor
          const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/)
          if (!m) continue
          const alpha = m[4] === undefined ? 1 : Number(m[4])
          if (alpha > 0.05 && Number(m[1]) > 235 && Number(m[2]) > 235 && Number(m[3]) > 235) {
            bad.push({
              tag: el.tagName.toLowerCase(),
              cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
              rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
              bg,
              text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
            })
          }
        }
        // The closed overlay is the one element that can paint a white gradient
        // without a white backgroundColor. It must be fully hidden on '/'.
        const panel = document.querySelector('.loom-overlay-panel')
        if (panel) {
          const s = getComputedStyle(panel)
          if (s.visibility !== 'hidden' && Number(s.opacity) > 0.05) {
            const r = panel.getBoundingClientRect()
            bad.push({
              tag: 'overlay-panel',
              cls: 'loom-overlay-panel',
              rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
              bg: s.backgroundImage.slice(0, 80),
              text: 'closed overlay still painted',
            })
          }
        }
        const htmlBg = getComputedStyle(document.documentElement).backgroundColor
        const bodyBg = getComputedStyle(document.body).backgroundColor
        return {
          bad: bad.slice(0, 8),
          htmlBg,
          bodyBg,
          boot: Boolean(document.querySelector('#boot')),
          app: Boolean(document.querySelector('.lm-root, .app-page, .loom-overlay-panel')),
          scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
          innerWidth: vw,
        }
      })

      const ok = result.bad.length === 0 && !result.boot && result.app && dark(result.htmlBg) && dark(result.bodyBg)
      if (ok) {
        passed += 1
      } else {
        failures += 1
        const shot = `${outDir}/${profile.name}-${i}.png`
        await page.screenshot({ path: shot, fullPage: false })
        console.log(`FAIL ${profile.name} #${i}`, JSON.stringify(result), errors.slice(0, 2), shot)
      }
    } catch (error) {
      failures += 1
      const shot = `${outDir}/${profile.name}-${i}.png`
      await page.screenshot({ path: shot, fullPage: false }).catch(() => {})
      console.log(`FAIL ${profile.name} #${i}`, String(error).slice(0, 220), errors.slice(0, 2), shot)
    } finally {
      await ctx.close()
    }
  }
  console.log(`${profile.name}: ${passed}/${runs} passed`)
}

await browser.close()
if (failures > 0) {
  console.log(`audit failed: ${failures} open(s) with a white surface, stuck boot, or non-dark background`)
  process.exit(1)
}
console.log(`audit passed: ${runs * profiles.length} cold opens, no white surface`)
