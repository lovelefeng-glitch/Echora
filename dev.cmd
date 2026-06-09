@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo Echora 2.0 Dev Server
echo ========================================

echo [1/2] Closing previous Electron processes...
taskkill /F /IM electron.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/2] Starting dev server...
echo ========================================
npm run dev
