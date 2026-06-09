@echo off
cd /d "%~dp0"
echo === Echora 2.0 Windows Build ===
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_CACHE=%LOCALAPPDATA%\electron\Cache
set CSC_IDENTITY_AUTO_DISCOVERY=false
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

echo Building...
call npm run build
if errorlevel 1 goto :error

echo Packaging portable exe...
call npx electron-builder --win portable --x64
if errorlevel 1 goto :error

echo === Build Complete ===
echo Output: release\Echora 2.0.0.exe
goto :end

:error
echo === Build Failed ===
exit /b 1

:end
pause
