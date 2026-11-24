#!/usr/bin/env bash
# Jelly Battle game server on an Oracle Cloud "Always Free" VM (Ubuntu 22.04/24.04, ARM or AMD).
# Run once on the VM:   curl -fsSL <raw url of this file> | sudo bash -s -- https://github.com/<you>/jelly-battle-server.git
# Result: always-on server at  wss://<your-ip-with-dashes>.sslip.io  (free HTTPS via Let's Encrypt, no domain needed)
set -euo pipefail
REPO="${1:-https://github.com/kuk62014-cmd/jelly-battle-server.git}"
ADMIN_CODE="${ADMIN_CODE:-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d " \n")}"
IP="$(curl -fsS https://api.ipify.org)"; HOST="${IP//./-}.sslip.io"
echo ">> public IP $IP  →  $HOST"

apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
# Caddy (automatic HTTPS + WebSocket proxy)
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy

# app
rm -rf /opt/jelly && git clone --depth 1 "$REPO" /opt/jelly
APP=/opt/jelly; [ -d /opt/jelly/jelly-battle-server ] && APP=/opt/jelly/jelly-battle-server
cd "$APP" && npm install --omit=dev
cat > /etc/systemd/system/jelly.service <<UNIT
[Unit]
Description=Jelly Battle game server
After=network.target
[Service]
WorkingDirectory=$APP
ExecStart=/usr/bin/node server/server.mjs
Environment=PORT=8787
Environment=ADMIN_CODE=$ADMIN_CODE
Environment=DB_FILE=/var/lib/jelly/players.json
Restart=always
RestartSec=2
Nice=-5
[Install]
WantedBy=multi-user.target
UNIT
mkdir -p /var/lib/jelly
systemctl daemon-reload && systemctl enable --now jelly

cat > /etc/caddy/Caddyfile <<CADDY
$HOST {
  encode gzip
  reverse_proxy 127.0.0.1:8787
}
CADDY
systemctl restart caddy

# Oracle Ubuntu images block everything but SSH in iptables — open web ports
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save

# one-command updates later:  sudo jelly-update
cat > /usr/local/bin/jelly-update <<UPD
#!/usr/bin/env bash
cd /opt/jelly && git pull --ff-only && cd "$APP" && npm install --omit=dev && systemctl restart jelly && echo updated
UPD
chmod +x /usr/local/bin/jelly-update

sleep 4
echo
echo "=============================================="
echo " Jelly Battle server is up:"
echo "   health : https://$HOST/health"
echo "   game   : wss://$HOST"
echo " Send this wss:// address to update the game."
echo "=============================================="
