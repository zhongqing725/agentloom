#!/bin/bash
set -euo pipefail

APP=/opt/agentloom
mkdir -p "$APP"
rm -rf "$APP/dist"
tar xzf /tmp/agentloom-deploy.tar.gz -C "$APP"
mkdir -p "$APP/data"

cat > /etc/systemd/system/agentloom.service <<'UNIT'
[Unit]
Description=AgentLoom web
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/agentloom
Environment=PORT=80
Environment=HOST=0.0.0.0
Environment=AGENTLOOM_DB=/opt/agentloom/data/agentloom.db
# 可选：/opt/agentloom/.env 里放 AGENTLOOM_API_KEY 等变量。
# 设置页里填的 Key 只改 process.env，重启就丢；要长期 Live 就写这个文件。
EnvironmentFile=-/opt/agentloom/.env
ExecStart=/usr/local/bin/node /opt/agentloom/server.mjs
Restart=always
RestartSec=2
StandardOutput=append:/var/log/agentloom.log
StandardError=append:/var/log/agentloom.log

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable agentloom >/dev/null 2>&1 || true
systemctl restart agentloom
sleep 4
systemctl is-active agentloom
curl -s -o /dev/null -w 'local health %{http_code}\n' http://127.0.0.1/api/health
curl -s http://127.0.0.1/api/health
echo
du -sh "$APP" | cut -f1
