#!/bin/bash
# 仅部署后端 API

set -e

echo "🚀 部署 Sunnybridge CRM API..."

cd /home/billow/.openclaw/workspace/projects/sunnybridge-crm/api

npx wrangler deploy

echo "✅ API 已部署到 https://api.changtian.dpdns.org"
