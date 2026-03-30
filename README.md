# Сброс счётчика памперса — Epson & Canon

Сбрасывает waste ink pad counter на струйных принтерах Epson и Canon через USB.

## Запуск готового .exe (Windows)

1. Скачайте `printer_reset.exe` из [Releases](../../releases) или из вкладки **Actions → последний билд → Artifacts**
2. Установите USB-драйвер libusb (нужно один раз):
   - Скачайте [Zadig](https://zadig.akeo.ie)
   - Подключите принтер по USB
   - В Zadig: **Options → List All Devices**
   - Найдите свой принтер, выберите драйвер **libusb-win32**
   - Нажмите **Install Driver**
3. Запустите `printer_reset.exe` **от имени администратора**
4. Нажмите «Обновить список» → выберите принтер → «Сбросить счётчик»
5. **Выключите и включите принтер**

## Сборка из исходников (Windows)

```bat
git clone <репозиторий>
cd printer_reset
build.bat
```

Готовый файл появится в папке `dist\printer_reset.exe`.

## Сборка через GitHub Actions (без Windows)

1. Залейте папку на GitHub
2. Перейдите во вкладку **Actions**
3. Запустите workflow **Build Windows EXE**
4. Скачайте артефакт `printer_reset_windows.zip`

## Поддерживаемые модели

| Производитель | Серии                                           |
|---------------|-------------------------------------------------|
| Epson         | L100–L3160, XP-600–XP-4105, ET-2700–ET-2815    |
| Canon         | PIXMA iP, MP, MG, G1000–G4470                  |
