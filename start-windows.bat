@echo off
title Class Live
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Download it free from https://nodejs.org then run this again. & pause & exit /b)
node server.js --open
pause
