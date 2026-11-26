@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Scriptorium Memorialium · OpenAI
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\launch-openai.ps1"
if errorlevel 1 (
  echo.
  echo OpenAI setup did not complete.
  pause
)
