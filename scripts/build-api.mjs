import { build } from 'esbuild'

// 把 Fastify 应用打成一个 Vercel 函数（ESM，node:sqlite 等内建保持 external）。
await build({
  entryPoints: ['src/server/vercel.ts'],
  outfile: 'api/index.mjs',
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
