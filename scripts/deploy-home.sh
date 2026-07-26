#!/bin/bash
set -e
cd /opt/ClippyBotV3
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.home.yml up -d --build
docker compose exec clippy node dist/src/deploy-commands.js
