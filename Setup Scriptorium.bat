@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Scriptorium Memorialium - setup
rem One-time setup: shortcuts, the Claude Desktop extension, FreeLLMAPI, the free keys (launcher\setup.ps1; every step asks first).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\setup.ps1"
