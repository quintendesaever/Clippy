#!/bin/bash
set -e
cd /opt/ClippyBotV3
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec clippy node dist/deploy-commands.js
