import { chromium } from 'playwright-core'

const base = process.env.BASE || 'http://127.0.0.1:5173'
const mobile = process.argv[2] === 'mobile'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } },
)
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')

for (const path of ['/', '/workflow']) {
  await page.goto(base + path, { waitUntil: 'load' })
  await page.waitForTimeout(3000)
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  await page.waitForTimeout(5000)
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  const wall = after.Timestamp - before.Timestamp
  const pct = (k) => (((after[k] - before[k]) / wall) * 100).toFixed(1).padStart(5)
  console.log(
    `${mobile ? 'mobile' : 'desktop'} ${path.padEnd(11)} cpu=${pct('TaskDuration')}% script=${pct('ScriptDuration')}% style=${pct('RecalcStyleDuration')}% layout=${pct('LayoutDuration')}%`,
  )
}
await browser.close()
