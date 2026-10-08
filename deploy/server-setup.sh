#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 VM (AWS EC2 or Azure VM) for YieldSense AI.
# Installs Docker Engine + the Compose plugin, opens the firewall for SSH/HTTP/HTTPS, adds a swap file
# (the API's ML stack needs it on 2 GB machines) and prepares ~/yieldsense.
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<branch>/deploy/server-setup.sh | bash
#   (or copy it to the server and run: bash server-setup.sh)
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "== Installing Docker Engine"
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
fi

if [ ! -f /swapfile ]; then
  echo "== Adding a 2 GB swap file"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if command -v ufw >/dev/null 2>&1; then
  echo "== Firewall: allow SSH, HTTP, HTTPS"
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
fi

mkdir -p ~/yieldsense/deploy ~/yieldsense/backups
echo
echo "Done. Log out and back in (so the docker group applies), then create ~/yieldsense/.env.docker"
echo "from .env.docker.example. The Deploy workflow copies the Compose files and starts the stack."
