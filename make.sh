#!/usr/bin/env bash
set -e
zip -r ../questall-bot.zip . -x "node_modules/*" -x "data/db.json"
echo "done -> ../questall-bot.zip"
