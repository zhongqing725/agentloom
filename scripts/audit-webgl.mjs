import { chromium } from 'playwright-core'

const base = process.env.BASE || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)))
page.on('console', (m) => {
  if (m.type() === 'error' || /webgl|context/i.test(m.text())) errors.push(`console.${m.type()}: ${m.text().slice(0, 160)}`)
})

await page.addInitScript(() => {
  window.__gl = { created: 0, lost: 0 }
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    if (String(type).startsWith('webgl')) window.__gl.created++
    const gl = orig.call(this, type, ...rest)
    if (gl && String(type).startsWith('webgl')) {
      this.addEventListener('webglcontextlost', () => { window.__gl.lost++ })
    }
    return gl
  }
})

await page.goto(base + '/', { waitUntil: 'load' })
await page.waitForTimeout(2500)

const snapshot = async (label) => {
  const info = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    gl: window.__gl,
    blank: [...document.querySelectorAll('canvas')]
      .filter((c) => c.width === 0 || c.height === 0)
      .length,
    nav: document.querySelector('.lm-mnav') ? 'mnav' : document.querySelector('.gooey-nav') ? 'gooey' : 'none',
  }))
  console.log(label.padEnd(14), JSON.stringify(info))
}

await snapshot('home')

for (const path of ['/workflow', '/team', '/plugins']) {
  await page.goto(base + path, { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  await snapshot('→ ' + path)
  await page.goBack({ waitUntil: 'load' })
  await page.waitForTimeout(1800)
  await snapshot('← back')
}

console.log('errors:', errors.length ? errors.slice(0, 6) : 'none')
await browser.close()
