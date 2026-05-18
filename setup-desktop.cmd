@echo off
chcp 65001 >nul
title Echora - Create Desktop Shortcut

echo.
echo   Creating Desktop Shortcut for Echora...
echo.

set "SCRIPT_DIR=%~dp0"
set "TARGET=%SCRIPT_DIR%start.cmd"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\Echora.lnk"

:: Create VBS script to generate the shortcut
set "VBS=%TEMP%\echora_shortcut.vbs"
(
    echo Set objShell = WScript.CreateObject^("WScript.Shell"^)
    echo strDesktop = objShell.SpecialFolders^("Desktop"^)
    echo Set objLink = objShell.CreateShortcut^(strDesktop ^& "\Echora.lnk"^)
    echo objLink.TargetPath = "%TARGET%"
    echo objLink.WorkingDirectory = "%SCRIPT_DIR%"
    echo objLink.Description = "Echora - AI Management Panel"
    echo objLink.IconLocation = "shell32.dll,14"
    echo objLink.Save
) > "%VBS%"

cscript //nologo "%VBS%"
del "%VBS%"

if exist "%SHORTCUT%" (
    echo   [OK] Shortcut created on your Desktop!
    echo.
    echo   Double-click "Echora" on your Desktop to start.
) else (
    echo   [ERROR] Failed to create shortcut. Right-click start.cmd and select
    echo   "Create Shortcut", then move it to your Desktop.
)

echo.
pause