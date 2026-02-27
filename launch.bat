@echo off
title BMAD Agent GUI
cd /d "%~dp0"

:: Check if build exists, if not build first
if not exist "build\index.html" (
    echo Building BMAD Agent GUI...
    call npm run build
)

:: Launch Electron
echo Starting BMAD Agent GUI...
node_modules\electron\dist\electron.exe .
