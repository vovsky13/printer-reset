"""
Сброс счётчика памперса для принтеров Epson через USB.

Протокол: ESC/P2 Remote Mode (REMOTE1).
Команда EE W — запись в EEPROM принтера.
"""

import struct
import time
import usb.core
import usb.util

# ---- Remote Mode команды ----
CMD_ENTER_REMOTE = b'\x1B\x28\x52\x08\x00\x00REMOTE1'
CMD_EXIT_REMOTE  = b'\x1B\x28\x52\x04\x00\x00EXIT'
CMD_INIT         = b'\x1B\x40'  # ESC @

# ---- Адреса EEPROM для счётчика памперса ----
# Применимо к большинству моделей Epson (L-series, XP-series, ET-series)
WASTE_INK_ADDRESSES = {
    # Основной памперс (16-бит, little-endian, два байта)
    'main_lo':      0x000D,
    'main_hi':      0x000E,
    # Второй памперс (есть не у всех моделей)
    'secondary_lo': 0x0010,
    'secondary_hi': 0x0011,
    # Третий памперс (у некоторых L/G-серий)
    'tertiary_lo':  0x0062,
    'tertiary_hi':  0x0063,
}


def _build_eeprom_write(address: int, value: int) -> bytes:
    """Формирует Remote-команду EE W для записи одного байта в EEPROM."""
    # Формат: 'EE' + 'W' + 0x00 0x00 + addr_lo + addr_hi + value
    addr_lo = address & 0xFF
    addr_hi = (address >> 8) & 0xFF
    payload = bytes([0x45, 0x45,        # 'EE'
                     0x57,              # 'W'
                     0x00, 0x00,
                     addr_lo, addr_hi,
                     value])
    # Remote-пакет: 2-байт длина payload (little-endian) + payload
    packet = struct.pack('<H', len(payload)) + payload
    return b'\x1B\x28\x52' + struct.pack('<H', len(packet)) + b'\x00' + packet


def _find_endpoints(device):
    """Возвращает (ep_out, ep_in) для bulk-обмена с принтером."""
    device.set_configuration()
    cfg = device.get_active_configuration()
    intf = cfg[(0, 0)]

    ep_out = usb.util.find_descriptor(
        intf,
        custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT
    )
    ep_in = usb.util.find_descriptor(
        intf,
        custom_match=lambda e: usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_IN
    )
    if ep_out is None or ep_in is None:
        raise RuntimeError("Не найдены bulk-эндпойнты принтера")
    return ep_out, ep_in


def reset_waste_ink(printer_info, log_cb=print) -> bool:
    """
    Сбрасывает счётчик памперса принтера Epson.

    :param printer_info: объект PrinterInfo с полем .device
    :param log_cb:       функция для вывода лога (по умолчанию print)
    :return: True при успехе
    """
    dev = printer_info.device

    # Отсоединяем kernel-драйвер (Linux/macOS)
    for cfg in dev:
        for intf in cfg:
            if dev.is_kernel_driver_active(intf.bInterfaceNumber):
                try:
                    dev.detach_kernel_driver(intf.bInterfaceNumber)
                    log_cb(f"  Kernel-драйвер отключён (интерфейс {intf.bInterfaceNumber})")
                except Exception as e:
                    log_cb(f"  Не удалось отключить kernel-драйвер: {e}")

    try:
        ep_out, ep_in = _find_endpoints(dev)

        log_cb("  Инициализация принтера...")
        ep_out.write(CMD_INIT)
        time.sleep(0.3)

        log_cb("  Вход в Remote Mode...")
        ep_out.write(CMD_ENTER_REMOTE)
        time.sleep(0.2)

        log_cb("  Сброс счётчиков EEPROM...")
        for name, addr in WASTE_INK_ADDRESSES.items():
            cmd = _build_eeprom_write(addr, 0x00)
            ep_out.write(cmd)
            time.sleep(0.05)
            log_cb(f"    Адрес {addr:#06x} ({name}) -> 0x00")

        log_cb("  Выход из Remote Mode...")
        ep_out.write(CMD_EXIT_REMOTE)
        time.sleep(0.2)

        log_cb("  Готово!")
        return True

    except usb.core.USBError as e:
        log_cb(f"  USB ошибка: {e}")
        return False
    except Exception as e:
        log_cb(f"  Ошибка: {e}")
        return False
    finally:
        usb.util.dispose_resources(dev)
