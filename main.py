#!/usr/bin/env python3
"""
Сброс счётчика памперса (waste ink pad counter) для струйных принтеров Epson и Canon.

Запуск:
    python main.py          — графический интерфейс
    python main.py --cli    — консольный режим

Требования:
    pip install pyusb libusb1

На macOS/Linux может потребоваться sudo для доступа к USB.
"""

import sys
import argparse


def run_gui():
    from gui import App
    app = App()
    app.mainloop()


def run_cli():
    from detect import find_printers
    import epson
    import canon

    print("=" * 60)
    print("  Сброс счётчика памперса — Epson & Canon")
    print("=" * 60)
    print("Сканирование USB-принтеров...")

    try:
        printers = find_printers()
    except Exception as e:
        print(f"Ошибка сканирования: {e}")
        print("Убедитесь, что pyusb установлен и есть права доступа к USB.")
        sys.exit(1)

    if not printers:
        print("Принтеры не найдены. Проверьте USB-подключение.")
        sys.exit(0)

    print(f"\nНайдено {len(printers)} принтер(ов):")
    for i, p in enumerate(printers):
        print(f"  [{i+1}] {p}")

    print()
    choice = input("Введите номер принтера (или 'все' для сброса всех, 'q' для выхода): ").strip().lower()

    if choice == 'q':
        sys.exit(0)

    if choice == 'все' or choice == 'all':
        targets = printers
    else:
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(printers):
                raise ValueError
            targets = [printers[idx]]
        except ValueError:
            print("Неверный ввод.")
            sys.exit(1)

    for p in targets:
        print(f"\n>> {p}")
        if p.vendor == 'epson':
            ok = epson.reset_waste_ink(p)
        else:
            ok = canon.reset_waste_ink(p)

        if ok:
            print("  [OK] Счётчик сброшен успешно.")
        else:
            print("  [ОШИБКА] Не удалось сбросить счётчик. Смотрите лог выше.")

    print("\nГотово! Выключите и включите принтер для применения изменений.")


def main():
    parser = argparse.ArgumentParser(
        description="Сброс счётчика памперса для струйных принтеров Epson и Canon"
    )
    parser.add_argument("--cli", action="store_true",
                        help="Запустить в консольном режиме (без GUI)")
    args = parser.parse_args()

    if args.cli:
        run_cli()
    else:
        run_gui()


if __name__ == "__main__":
    main()
