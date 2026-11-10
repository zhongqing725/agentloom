const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(__dirname + '/../data/agentloom.db', { readOnly: true })
for (const id of process.argv.slice(2)) {
  const run = db.prepare('select status, score, tokens, cost, started_at, finished_at from runs where id = ?').get(id)
  const last = db
    .prepare("select output_json, score from node_runs where run_id = ? and node_id = 'verifier' order by finished_at desc limit 1")
    .get(id)
  const v = last ? JSON.parse(last.output_json || '{}').verdict || {} : {}
  const claims = v.claims || []
  const tally = {}
  for (const c of claims) {
    const k = c.label || (c.supported ? 'supported' : 'unsupported')
    tally[k] = (tally[k] || 0) + 1
  }
  const secs = Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000)
  console.log(id, run.status, 'score=' + run.score, 'secs=' + secs, 'cost=' + run.cost, 'claims=' + claims.length, JSON.stringify(tally))
  const out = db.prepare("select output from runs where id = ?").get(id)
  const md = String(out.output || '')
  console.log('   report chars=' + md.length, 'gaps section=' + /证据缺口/.test(md), 'sections=' + (md.match(/^## /gm) || []).length)
}
