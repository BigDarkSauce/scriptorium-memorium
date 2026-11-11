@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Scriptorium Memorialium
if not exist "%~dp0Scriptorium Memorialium.lnk" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\make-shortcuts.ps1" >nul 2>&1
set PORT=8000
set "URL=http://localhost:%PORT%/"

rem The server is launcher\serve.py (or serve.ps1): the app's files plus the AI relay (FreeLLMAPI, NVIDIA, GitHub Models...).
rem Pick the server: a Python that really runs (the Microsoft Store placeholder "python" fails this probe),
rem else the py launcher, else the PowerShell server in launcher\serve.ps1.
set "SERVER=powershell"
python -c "import http.server" >nul 2>&1 && set "SERVER=python"
if "%SERVER%"=="powershell" py -3 -c "import http.server" >nul 2>&1 && set "SERVER=py"

echo Scriptorium Memorialium  -  %URL%   (server: %SERVER%)
echo Keep this window open while you use the app. Close it to stop.
echo.

rem The browser opens only once the server answers (launcher\open-when-ready.ps1 probes the address for up to 10 s).
start "" /b powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\open-when-ready.ps1" -Url "%URL%" -Seconds 10

if "%SERVER%"=="python" (
  python "%~dp0launcher\serve.py" %PORT%
) else if "%SERVER%"=="py" (
  py -3 "%~dp0launcher\serve.py" %PORT%
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\serve.ps1" -Port %PORT%
)
if errorlevel 1 (
  echo.
  echo The server stopped with an error. If port %PORT% is already in use, close the other window or program using it.
  pause
)
