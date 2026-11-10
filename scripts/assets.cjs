const https = require('node:https')

const base = process.argv[2]
https.get(base + '/', { timeout: 20000 }, (res) => {
  let body = ''
  res.setEncoding('utf8')
  res.on('data', (d) => (body += d))
  res.on('end', () => {
    console.log('status', res.statusCode)
    console.log((body.match(/\/assets\/[^"']+\.(css|js)/g) || []).join('\n'))
  })
}).on('error', (e) => console.log('ERR', e.message))
