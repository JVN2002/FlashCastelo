@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar_atalho_desktop.ps1"
if errorlevel 1 (
  echo.
  echo Falha ao criar o atalho na area de trabalho.
  pause
  exit /b 1
)

echo.
echo Atalho criado com sucesso na area de trabalho.
pause
exit /b 0
