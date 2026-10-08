@echo off
chcp 65001 >nul
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Установите Node.js LTS с https://nodejs.org и снова запустите этот файл.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto failure
call npm run build
if errorlevel 1 goto failure
echo Готово. Теперь запустите Start.cmd.
pause
exit /b 0
:failure
echo Установка не завершена. Скопируйте сообщение об ошибке.
pause
exit /b 1
