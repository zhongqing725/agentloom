import { chromium } from 'playwright-core'

const base = process.env.BASE || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

// 统计应用自身每帧的 rAF 回调数
await page.addInitScript(() => {
  window.__raf = 0
  const orig = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => orig((t) => { window.__raf++; return cb(t) })
})

const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')

for (const path of ['/', '/workflow']) {
  await page.goto(base + path, { waitUntil: 'load' })
  await page.waitForTimeout(3000)

  const sample = async (label) => {
    const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
    const rafBefore = await page.evaluate(() => window.__raf)
    await page.waitForTimeout(5000)
    const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
    const rafAfter = await page.evaluate(() => window.__raf)
    const d = (k) => +(after[k] - before[k]).toFixed(3)
    const wall = after.Timestamp - before.Timestamp
    const rafPerSec = Math.round((rafAfter - rafBefore) / wall)
    console.log(
      `${path} ${label}: cpu=${((d('TaskDuration') / wall) * 100).toFixed(1)}%`,
      `script=${((d('ScriptDuration') / wall) * 100).toFixed(1)}%`,
      `style=${((d('RecalcStyleDuration') / wall) * 100).toFixed(1)}%`,
      `layout=${((d('LayoutDuration') / wall) * 100).toFixed(1)}%`,
      `raf/s=${rafPerSec}`,
      `heap=${(after.JSHeapUsedSize / 1048576).toFixed(1)}MB`,
    )
  }

  await sample('idle(5s)')
}

await browser.close()
