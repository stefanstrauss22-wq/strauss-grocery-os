@echo off
title Strauss Grocery OS  -  Checkers Login
cd /d "C:\Users\ss21\OneDrive - Intercare Managed Healthcare (Pty) Ltd\Co-Work\Automation\grocery-os\server"
echo ============================================================
echo   STRAUSS GROCERY OS - Save your Checkers login
echo ============================================================
echo.
echo A browser will open. Log in to Checkers, choose your Sixty60
echo delivery address, then come back here and press ENTER.
echo.
call npm run sixty60:login
echo.
pause
