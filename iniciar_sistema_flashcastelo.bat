@echo off
setlocal EnableExtensions

cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "FRONTEND_URL=http://localhost:5500/index.html"
set "LOG_DIR=%PROJECT_ROOT%\logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

echo ============================================
echo   Flash Castelo - Inicializacao Local
echo ============================================

call :ensure_cmd node "Node.js"
if errorlevel 1 goto :fail

call :ensure_cmd npm "npm"
if errorlevel 1 goto :fail

call :is_up "http://localhost:3000/" API_IS_UP
if "%API_IS_UP%"=="1" (
  echo API Maquininha 3000 ja esta em execucao.
) else (
  echo Iniciando API Maquininha 3000...
  call :start_detached "%PROJECT_ROOT%" "npm run start" "%LOG_DIR%\api-3000.log" "API Maquininha 3000"
)

call :is_up "http://localhost:3333/health" BACKEND_IS_UP
if "%BACKEND_IS_UP%"=="1" (
  echo Backend Fiscal 3333 ja esta em execucao.
) else (
  call :has_backend_database_url BACKEND_HAS_DATABASE_URL
  if "%BACKEND_HAS_DATABASE_URL%"=="1" (
    echo Iniciando Backend Fiscal 3333...
    call :start_detached "%PROJECT_ROOT%\backend" "npm run start" "%LOG_DIR%\backend-3333.log" "Backend Fiscal 3333"
  ) else (
    echo [AVISO] Backend Fiscal 3333 nao iniciado: configure DATABASE_URL no arquivo backend\.env
  )
)

call :is_up "http://localhost:5500/index.html" FRONTEND_IS_UP
if "%FRONTEND_IS_UP%"=="1" (
  echo Frontend 5500 ja esta em execucao.
) else (
  echo Iniciando Frontend 5500...
  call :start_detached "%PROJECT_ROOT%" "node scripts\static-server.js 5500" "%LOG_DIR%\frontend-5500.log" "Frontend 5500"
)

timeout /t 2 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '%FRONTEND_URL%'" >nul 2>&1

echo.
echo Sistema aberto em %FRONTEND_URL%
echo Logs: %LOG_DIR%
echo.
exit /b 0

:is_up
set "%~2=0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%~1' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not errorlevel 1 set "%~2=1"
exit /b 0

:start_detached
set "WORKDIR=%~1"
set "CMD_LINE=%~2"
set "LOG_FILE=%~3"
set "WINDOW_TITLE=%~4"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$wd='%WORKDIR%'; $log='%LOG_FILE%'; $cmd='%CMD_LINE%'; Start-Process -WindowStyle Minimized -FilePath 'cmd.exe' -WorkingDirectory $wd -ArgumentList @('/d','/c', ($cmd + ' >> \"' + $log + '\" 2>&1')) | Out-Null"
exit /b 0

:has_backend_database_url
set "%~1=0"
if not exist "%PROJECT_ROOT%\backend\.env" exit /b 0
findstr /r /i "^DATABASE_URL=." "%PROJECT_ROOT%\backend\.env" >nul 2>&1
if not errorlevel 1 set "%~1=1"
exit /b 0

:ensure_cmd
where %~1 >nul 2>&1
if errorlevel 1 (
  echo [ERRO] %~2 nao encontrado no computador.
  exit /b 1
)
exit /b 0

:fail
echo.
echo Falha ao iniciar o sistema.
echo.
pause
exit /b 1
