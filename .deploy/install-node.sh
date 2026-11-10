#!/bin/bash
set -euo pipefail
mkdir -p /opt/node
cd /opt/node
if [ ! -x /opt/node/bin/node ]; then
  curl -fsSL -o node.tar.gz https://unofficial-builds.nodejs.org/download/release/v24.22.2/node-v24.22.2-linux-x64-glibc-217.tar.gz
  tar xzf node.tar.gz --strip-components=1
  rm -f node.tar.gz
fi
ln -sf /opt/node/bin/node /usr/local/bin/node
ln -sf /opt/node/bin/npm /usr/local/bin/npm
ln -sf /opt/node/bin/npx /usr/local/bin/npx
/usr/local/bin/node -v
/usr/local/bin/node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/tmp/t.db');d.exec('create table if not exists t(a)');console.log('sqlite ok')"
