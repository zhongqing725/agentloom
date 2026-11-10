import http from 'node:http'
import assert from 'node:assert/strict'
import handler from '../api/index.mjs'

const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => {
    res.statusCode = 500
    res.end(String(error))
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const health = await (await fetch(`${base}/api/health`)).json()
assert.equal(health.ok, true)

const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json()
assert.ok(bootstrap.project?.id, 'bootstrap.project 缺失')
assert.ok(bootstrap.documents?.length > 0, '知识库未播种')

const created = await fetch(`${base}/api/runs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: '冒烟测试：AI 眼镜产业链' }),
})
assert.equal(created.status, 201)
const { run } = await created.json()
assert.ok(run.id)

const detail = await (await fetch(`${base}/api/runs/${run.id}`)).json()
assert.equal(detail.run.status, 'completed', `运行未完成：${detail.run.status}`)
assert.ok(detail.run.output?.length > 100, '报告为空')

console.log(`OK  health=${health.mode}  docs=${bootstrap.documents.length}  run=${detail.run.status}  report=${detail.run.output.length}字`)
server.close()
