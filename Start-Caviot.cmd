@echo off
title Caviot Studio - Build 2026.09.17
echo Caviot Studio build 2026.09.17
echo This is the offline-font and modular-app update.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js, then run this file again.
  pause
  exit /b 1
)
node serve.mjs
pause
