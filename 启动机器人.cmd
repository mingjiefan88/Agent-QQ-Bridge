@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0.agents\plugins\codex-qq-bridge\scripts\launcher.ps1"
if errorlevel 1 pause
