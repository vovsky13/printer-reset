"""
Сброс счётчика памперса для принтеров Canon через USB.

Используется прямая запись в сервисный регистр через Control Transfer,
и команды сервисного режима через bulk-эндпойнты (iP/MG/G серии).
"""

import struct
import time
import usb.core
import usb.util

# Canon USB control transfer запросы
CANON_VENDOR_REQUEST = 0x04

# Команды сброса для разных серий
# Canon iP/MP/MG серия — команды через bulk OUT
RESET_CMD_SERIES_1 = bytes([
    0x00, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])

# Canon G серия (EcoTank/MegaTank) — другой формат
RESET_CMD_G_SERIES = bytes([
    0x1B, 0x43, 0x01, 0x00,  # ESC C — сброс счётчика
])

# Идентификаторы G-серии Canon (EcoTank)
CANON_G_SERIES_PIDS = {
    0x17AF, 0x17B0, 0x17B1, 0x17B3,
    0x17C8, 0x17C9, 0x17CA, 0x17CB,
    0x1882, 0x1883, 0x1884, 0x1885,
}

# Команды сервисного режима Canon iP/MG/MP
SERVICE_ENTER    = b'\x1B\x5B\x4B\x02\x00\x00\x1F'
SERVICE_EXIT     = b'\x1B\x5B\x4B\x02\x00\x00\x00'

# Сброс счётчика поглотителя чернил
ABSORBER_RESET_1 = b'\x1B\x5B\x4B\x02\x00\x00\x0F'  # основной
ABSORBER_RESET_2 = b'\x1B\x5B\x4B\x02\x00\x00\x10'  # резервный

# Alternate: через PJL-like команды (MG/G-серия новые модели)
PJL_RESET_COUNTER = b'@PJL SET COUNTERS=PURGE\r\n'


def _find_endpoints(device):
    """Возвращает (ep_out, ep_in) для bulk-обмена."""
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
    if ep_out is None:
        raise RuntimeError("Не найден bulk OUT эндпойнт")
    return ep_out, ep_in


def _reset_ip_mg_series(dev, ep_out, ep_in, log_cb):
    """Сброс для iP/MG/MP серии Canon."""
    log_cb("  Вход в сервисный режим (iP/MG/MP серия)...")
    ep_out.write(SERVICE_ENTER)
    time.sleep(0.3)

    log_cb("  Сброс основного счётчика поглотителя...")
    ep_out.write(ABSORBER_RESET_1)
    time.sleep(0.2)

    log_cb("  Сброс резервного счётчика поглотителя...")
    ep_out.write(ABSORBER_RESET_2)
    time.sleep(0.2)

    log_cb("  Выход из сервисного режима...")
    ep_out.write(SERVICE_EXIT)
    time.sleep(0.2)


def _reset_g_series(dev, ep_out, ep_in, log_cb):
    """Сброс для G-серии Canon (MegaTank/EcoTank)."""
    log_cb("  Сброс счётчика G-серии (EcoTank)...")

    # Используем PJL-команду
    ep_out.write(PJL_RESET_COUNTER)
    time.sleep(0.3)

    # Дополнительно — прямая команда
    ep_out.write(RESET_CMD_G_SERIES)
    time.sleep(0.2)


def reset_waste_ink(printer_info, log_cb=print) -> bool:
    """
    Сбрасывает счётчик памперса принтера Canon.

    :param printer_info: объект PrinterInfo
    :param log_cb:       функция для вывода лога
    :return: True при успехе
    """
    dev = printer_info.device
    pid = printer_info.pid

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

        if pid in CANON_G_SERIES_PIDS:
            _reset_g_series(dev, ep_out, ep_in, log_cb)
        else:
            _reset_ip_mg_series(dev, ep_out, ep_in, log_cb)

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
