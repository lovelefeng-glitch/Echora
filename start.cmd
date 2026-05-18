@echo off
chcp 65001 >nul 2>&1
title Echora - AI Management Panel
color 0A
cd /d "%~dp0"

echo.
echo   +========================================+
echo   ^|       Echora - AI Management Panel      ^|
echo   +========================================+
echo.

:: 1. Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Node.js not found.
    echo   Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo   [OK] Node.js ready

:: 2. Check npm dependencies
if not exist "node_modules" (
    echo.
    echo   [*] Installing dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo   [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
)
echo   [OK] Dependencies ready

:: 3. Check if electron is installed
if not exist "node_modules\.bin\electron.cmd" (
    echo.
    echo   [ERROR] Electron not found in node_modules.
    echo   Run: npm install
    pause
    exit /b 1
)
echo   [OK] Electron found

:: 4. Launch
echo.
echo   [>>] Starting Echora...
echo   [>>] Close this window to stop Echora.
echo.
echo   +========================================+
echo.

:: Launch directly - keep this window open for error visibility
npm start

:: If we reach here, electron exited
echo.
echo   Echora has stopped.
pause