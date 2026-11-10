const http = require('node:http')

const base = process.argv[2] || 'http://103.68.192.80'

function req(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null
    const rq = http.request(
      base + path,
      { method, timeout: 120000, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => {
        let b = ''
        res.setEncoding('utf8')
        res.on('data', (d) => (b += d))
        res.on('end', () => resolve({ status: res.statusCode, body: b }))
      },
    )
    rq.on('error', (e) => resolve({ status: 'ERR', body: e.message }))
    rq.on('timeout', () => { rq.destroy(); resolve({ status: 'TIMEOUT', body: '' }) })
    if (data) rq.write(data)
    rq.end()
  })
}

;(async () => {
  const home = await req('GET', '/')
  const title = (home.body.match(/<title>(.*?)<\/title>/) || [])[1]
  const asset = (home.body.match(/\/assets\/[^"']+\.js/) || [])[0]
  console.log('home', home.status, '| title:', title, '| asset:', asset)

  const started = Date.now()
  const created = await req('POST', '/api/runs', { input: 'VPS 部署验证：AI 眼镜产业链' })
  console.log('POST /api/runs', created.status, `${Math.round((Date.now() - started) / 1000)}s`, created.body.slice(0, 100))
  try {
    const id = JSON.parse(created.body).run.id
    const detail = await req('GET', '/api/runs/' + id)
    const run = JSON.parse(detail.body).run
    console.log('run', run.status, `${(run.output || '').length} 字`)
  } catch (error) {
    console.log('run check skipped:', error.message)
  }
})()
