@echo off
title Strauss Grocery OS  -  Build Cart
cd /d "C:\Users\ss21\OneDrive - Intercare Managed Healthcare (Pty) Ltd\Co-Work\Automation\grocery-os\server"
echo ============================================================
echo   STRAUSS GROCERY OS - Building your Sixty60 cart
echo ============================================================
echo.
echo Chrome will open in a moment and fill your trolley.
echo Do not click inside it while it works.
echo When it is done, review and pay in that window, then close it.
echo.
call npm run cart:build
echo.
echo Finished. You can close this window.
pause
