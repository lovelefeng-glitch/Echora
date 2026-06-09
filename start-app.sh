#!/bin/bash
# Echora 启动脚本

cd "E:\AI\Echora 2.0"

echo "🚀 启动 Echora 应用..."

# 使用 npx 直接启动 electron，避免路径问题
npx electron . 2>&1 &

sleep 5
echo "✅ 应用应该已启动"
