import { build } from 'esbuild'

// 单文件服务端：Fastify + 静态站，直接 `node server.mjs` 就能跑（VPS / Docker 通用）。
await build({
  entryPoints: ['src/server/index.ts'],
  outfile: 'build/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning',
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module'",
      "import { fileURLToPath as __ftp } from 'node:url'",
      "import { dirname as __dn } from 'node:path'",
      'const __filename = __ftp(import.meta.url)',
      'const __dirname = __dn(__filename)',
      'const require = __cr(import.meta.url)',
    ].join('\n'),
  },
})
