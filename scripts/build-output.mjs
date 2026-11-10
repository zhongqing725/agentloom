import fs from 'node:fs'
import path from 'node:path'

// Build Output API v3 产物：静态站点 + 一个 Fastify 函数，无需 Vercel 本地构建器。
const out = '.vercel/output'
const staticDir = path.join(out, 'static')
const funcDir = path.join(out, 'functions/api.func')

fs.rmSync(out, { recursive: true, force: true })
fs.cpSync('dist/web', staticDir, { recursive: true })
fs.mkdirSync(funcDir, { recursive: true })

fs.copyFileSync('api/index.mjs', path.join(funcDir, 'index.mjs'))
fs.writeFileSync(path.join(funcDir, 'package.json'), JSON.stringify({ type: 'module' }))
fs.writeFileSync(
  path.join(funcDir, '.vc-config.json'),
  JSON.stringify(
    { runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', maxDuration: 60, memory: 1024 },
    null,
    2,
  ),
)

fs.writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '^/.*$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
)

console.log(`build-output: static=${fs.readdirSync(staticDir).length} 项, function=${fs.statSync(path.join(funcDir, 'index.mjs')).size} bytes`)
