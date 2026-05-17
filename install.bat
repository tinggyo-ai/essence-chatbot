@echo off
chcp 65001 > nul
title Essence - Installer
set "INSTALL_DIR=C:\Essence"

cls
echo.
echo   ==============================================
echo     Essence AI 업무 어시스턴트 - 설치 프로그램
echo                    v1.0
echo   ==============================================
echo.
echo   설치 위치: %INSTALL_DIR%
echo.
echo   -------------------------------------------
echo.

:: [1/5] Node.js 확인
echo   [1/5] Node.js 확인 중...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   [오류] Node.js가 설치되어 있지 않습니다.
    echo.
    echo   아래 주소에서 Node.js LTS 버전을 먼저 설치해 주세요:
    echo.
    echo       https://nodejs.org
    echo.
    echo   설치 후 이 파일을 다시 실행하세요.
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)
for /f %%v in ('node --version') do echo         Node.js %%v 확인됨.
echo.

:: [2/5] 파일 복사
echo   [2/5] 파일 복사 중...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
xcopy /E /I /Y /Q "%~dp0source\." "%INSTALL_DIR%\" > nul
if %errorlevel% neq 0 (
    echo.
    echo   [오류] 파일 복사 실패.
    echo   이 파일을 마우스 오른쪽 클릭 - [관리자 권한으로 실행] 해보세요.
    pause
    exit /b 1
)
icacls "%INSTALL_DIR%" /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" > nul
echo         파일 복사 완료.
echo.

:: [3/5] Electron 설치
echo   [3/5] Electron 설치 중...
if exist "%~dp0source\node_modules\electron\dist\electron.exe" (
    echo         오프라인 번들 복사 중 ^(잠시 기다려 주세요^)...
    xcopy /E /I /Y /Q "%~dp0source\node_modules\." "%INSTALL_DIR%\node_modules\" > nul
    echo         오프라인 설치 완료.
) else (
    echo         인터넷에서 다운로드 중 ^(약 200MB, 2-5분 소요^)...
    echo         완료될 때까지 창을 닫지 마세요.
    cd /d "%INSTALL_DIR%"
    call npm install >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo   [오류] Electron 설치 실패.
        echo   인터넷 연결을 확인하고 다시 시도하세요.
        cd /d "%~dp0"
        pause
        exit /b 1
    )
    cd /d "%~dp0"
    echo         다운로드 완료.
)
echo.

:: [4/5] 바탕화면 바로가기
echo   [4/5] 바탕화면 바로가기 생성 중...
set "ELECTRON_PATH=%INSTALL_DIR%\node_modules\electron\dist\electron.exe"
powershell -ExecutionPolicy Bypass -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%USERPROFILE%\Desktop\Essence.lnk');$s.TargetPath='%ELECTRON_PATH%';$s.Arguments='.';$s.WorkingDirectory='%INSTALL_DIR%';$s.IconLocation='%INSTALL_DIR%\icon.ico,0';$s.Description='Essence AI 업무 어시스턴트';$s.Save()"
echo         바탕화면 바로가기 생성 완료.
echo.

:: [5/5] 시작 메뉴 등록
echo   [5/5] 시작 메뉴 등록 중...
set "STARTDIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Essence"
if not exist "%STARTDIR%" mkdir "%STARTDIR%"
powershell -ExecutionPolicy Bypass -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%STARTDIR%\Essence.lnk');$s.TargetPath='%ELECTRON_PATH%';$s.Arguments='.';$s.WorkingDirectory='%INSTALL_DIR%';$s.IconLocation='%INSTALL_DIR%\icon.ico,0';$s.Description='Essence AI 업무 어시스턴트';$s.Save()"
echo         시작 메뉴 등록 완료.
echo.

echo   ==============================================
echo               설치가 완료되었습니다!
echo   ==============================================
echo.
echo   다음 단계 - Groq API 키 발급 ^(완전 무료^):
echo.
echo     1. console.groq.com 접속
echo     2. Google 계정으로 로그인 / 회원가입
echo     3. 왼쪽 메뉴 [API Keys] 클릭
echo     4. [Create API Key] 클릭 후 키 복사
echo     5. Essence 실행 - 키 붙여넣기 - 완료!
echo.
echo   자세한 안내: 가이드\Groq_API_키_발급방법.txt
echo.
set /p LAUNCH=  지금 Essence를 실행할까요? (Y/N):
if /i "%LAUNCH%"=="Y" (
    echo.
    echo   Essence를 시작합니다...
    start "" "%ELECTRON_PATH%" "%INSTALL_DIR%"
    timeout /t 2 /nobreak > nul
)
echo.
echo   설치해 주셔서 감사합니다!
pause
exit /b 0
