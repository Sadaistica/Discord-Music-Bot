@echo off
echo ========================================
echo    Discord Music Bot
echo ========================================
echo.
echo Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed!
    echo Download it from: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v

echo Detected version: %NODEVER%
echo Recommended Node >= 22.12.0

echo.
echo Checking dependencies...
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Error installing dependencies!
        pause
        exit /b 1
    )
)

echo ✅ Dependencies are installed

echo.
echo Checking configuration...
if not exist "config.json" (
    echo ❌ config.json file does not exist!
    echo 💡 Copy config.json.example to config.json and fill in values
    pause
    exit /b 1
)

echo ✅ Configuration found

echo.
echo 🚀 Starting the bot...
echo 💡 Tip: Run setup.bat to configure interactively.
node index.js

echo.
echo Bot has been terminated.
pause