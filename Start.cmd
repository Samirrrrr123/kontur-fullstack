@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "KONTUR_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  set "KONTUR_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
)
if not exist node_modules\express (
  echo Сначала запустите Install.cmd, чтобы установить зависимости.
  pause
  exit /b 1
)
if not exist dist\index.html (
  "%KONTUR_NODE%" node_modules\typescript\bin\tsc --noEmit
  if errorlevel 1 goto failure
  "%KONTUR_NODE%" node_modules\vite\bin\vite.js build
  if errorlevel 1 goto failure
)
"%KONTUR_NODE%" scripts\launch.js
if errorlevel 1 goto failure
exit /b 0
:failure
echo Не удалось запустить проект. Скопируйте сообщение об ошибке.
pause
exit /b 1
