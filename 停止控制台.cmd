@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0.agents\plugins\codex-qq-bridge\scripts\stop-console.ps1"
if errorlevel 1 pause
