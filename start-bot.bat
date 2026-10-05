@echo off
title ByteBangla Facebook Automation Hub
echo ========================================================
echo   Starting ByteBangla 100%% Autonomous Content Hub
echo ========================================================
cd /d "%~dp0auto-fb-bot"

echo Checking node modules...
if not exist node_modules (
    echo Installing dependencies...
    npm install
)

echo Starting Bot Server with Live Scheduling...
npm run dev
pause
