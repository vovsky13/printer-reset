@echo off
chcp 65001 >nul
echo ============================================
echo   Сборка printer_reset.exe
echo ============================================
echo.

:: Проверяем Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Python не найден.
    echo Скачайте Python 3.9+ с https://python.org и установите с галочкой "Add to PATH"
    pause
    exit /b 1
)

echo [1/4] Обновление pip...
python -m pip install --upgrade pip --quiet

echo [2/4] Установка зависимостей...
python -m pip install pyusb pyinstaller --quiet
if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить зависимости.
    pause
    exit /b 1
)

echo [3/4] Скачивание libusb для Windows...
:: Скачиваем libusb-1.0.dll через Python если нет
python -c "import urllib.request, zipfile, os, shutil; ^
url='https://github.com/libusb/libusb/releases/download/v1.0.27/libusb-1.0.27.7z'; ^
print('libusb будет установлен через zadig — см. README')" 2>nul

echo [4/4] Сборка .exe...
pyinstaller --clean printer_reset.spec
if errorlevel 1 (
    echo [ОШИБКА] Сборка завершилась с ошибкой.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ГОТОВО! Файл: dist\printer_reset.exe
echo ============================================
echo.
echo ВАЖНО: Для работы с USB-принтером на Windows
echo нужно установить libusb-драйвер через Zadig:
echo   1. Скачайте Zadig с https://zadig.akeo.ie
echo   2. Подключите принтер
echo   3. В Zadig: Options → List All Devices
echo   4. Выберите свой принтер, драйвер: libusb-win32
echo   5. Нажмите "Install Driver"
echo.
pause
