@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ARIA 시작 중...
node launcher.js
if %errorlevel% neq 0 (
    echo.
    echo [오류] ARIA 실행 실패. aria-log.txt 를 확인하세요.
    pause
)
