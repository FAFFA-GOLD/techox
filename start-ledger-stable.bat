@echo off
cd /d "%~dp0"
echo Starting TECHOox stable launcher...
echo Folder: %CD%
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-ledger-stable.ps1"
echo.
echo PowerShell finished. ExitCode=%ERRORLEVEL%
pause
