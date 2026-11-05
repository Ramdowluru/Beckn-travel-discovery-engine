@echo off
setlocal
PowerShell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
if errorlevel 1 (
    echo.
    echo start-dev failed. Review the message above.
    pause
    exit /b 1
)
endlocal
