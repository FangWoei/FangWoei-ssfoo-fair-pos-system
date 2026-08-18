@echo off
title SS FOO FAIR - cash drawer helper - LEAVE THIS OPEN
cd /d "%~dp0"
node drawer-helper.cjs
echo.
echo The helper stopped. If you did not press Ctrl+C, read the message above.
pause