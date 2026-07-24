@echo off
cd /d "%~dp0"
title Discord Archive Bot

echo ================================================
echo Discord Archive Bot Launcher
echo Keep this window open while the bot is running.
echo ================================================
echo.

where py >nul 2>nul
if not errorlevel 1 goto USE_PY

where python >nul 2>nul
if not errorlevel 1 goto USE_PYTHON

echo ERROR: Python was not found.
echo Install Python from https://www.python.org/downloads/
echo During setup, check "Add Python to PATH".
pause
exit /b 1

:USE_PY
set "PYTHON_EXE=py"
goto CHECK_ENV

:USE_PYTHON
set "PYTHON_EXE=python"

:CHECK_ENV
if not exist ".env" goto NO_ENV

echo Installing required packages...
"%PYTHON_EXE%" -m pip install -r requirements.txt
if errorlevel 1 goto PIP_ERROR

echo.
echo Starting the Discord bot...
echo If login succeeds, the bot will appear online in Discord.
echo.
"%PYTHON_EXE%" bot.py

echo.
echo The bot stopped or an error occurred.
pause
exit /b 0

:NO_ENV
echo ERROR: .env file was not found in this folder.
echo Create a file named .env with this single line:
echo DISCORD_BOT_TOKEN=YOUR_REAL_BOT_TOKEN
pause
exit /b 1

:PIP_ERROR
echo ERROR: Package installation failed.
pause
exit /b 1
