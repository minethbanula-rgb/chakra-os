@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer, or open Chakra-Studio-OS.html directly.
  pause
  exit /b 1
)
start "" http://localhost:5173
node server.mjs
pause
