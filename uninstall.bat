@echo off
chcp 65001 > nul
title ARIA AI 어시스턴트 - 제거

cls
echo.
echo   ==============================================
echo     ARIA AI 업무 어시스턴트 - 제거 프로그램
echo   ==============================================
echo.
echo   ARIA를 완전히 제거합니다.
echo   저장된 설정 및 API 키도 함께 삭제됩니다.
echo.
set /p CONFIRM=  정말 제거하시겠습니까? (Y/N):
if /i not "%CONFIRM%"=="Y" (
    echo   취소했습니다.
    timeout /t 2 /nobreak > nul
    exit /b 0
)
echo.

set "INSTALL_DIR=C:\ARIA"

echo   [1/4] 앱 파일 제거 중...
if exist "%INSTALL_DIR%" (
    rmdir /S /Q "%INSTALL_DIR%"
    echo         완료.
) else (
    echo         건너뜀 (폴더 없음).
)

echo   [2/4] 바탕화면 바로가기 제거 중...
if exist "%USERPROFILE%\Desktop\ARIA AI.lnk" (
    del "%USERPROFILE%\Desktop\ARIA AI.lnk"
    echo         완료.
)

echo   [3/4] 시작 메뉴 제거 중...
set "STARTDIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\ARIA"
if exist "%STARTDIR%" (
    rmdir /S /Q "%STARTDIR%"
    echo         완료.
)

echo   [4/4] 레지스트리 제거 중...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\ARIA" /f > nul 2>&1
echo         완료.

echo.
echo   ==============================================
echo     ARIA 제거가 완료되었습니다.
echo   ==============================================
echo.
pause
exit /b 0
