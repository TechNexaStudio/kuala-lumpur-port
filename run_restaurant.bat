@echo off
title Kuala Lumpur Port - Restaurant System
cd /d "%~dp0"
echo ========================================================
echo   KUALA LUMPUR PORT - RESTAURANT MANAGEMENT SYSTEM
echo ========================================================
echo Starting Server at http://localhost:3000 ...
start "" http://localhost:3000/admin
start "" http://localhost:3000/cashier
start "" http://localhost:3000/?table=1
node server.js
pause
