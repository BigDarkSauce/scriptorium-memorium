@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Scriptorium Memorium
if not exist "%~dp0Scriptorium Memorium.lnk" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\make-shortcuts.ps1" >nul 2>&1
set PORT=8000
echo Scriptorium Memorium  -  http://localhost:%PORT%
echo Keep this window open while you use the app. Close it to stop.
start "" "http://localhost:%PORT%"
where python >nul 2>&1 && (python -m http.server %PORT% & goto :eof)
where py >nul 2>&1 && (py -m http.server %PORT% & goto :eof)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\serve.ps1" -Port %PORT%
