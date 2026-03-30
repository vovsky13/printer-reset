// Сброс и чтение счётчика памперса Epson через WebUSB
// Протокол: ESC/P2 Remote Mode (REMOTE1)
// EE W — запись EEPROM, EE R — чтение EEPROM

const CMD_INIT         = new Uint8Array([0x1B, 0x40]);
const CMD_ENTER_REMOTE = new Uint8Array([
  0x1B, 0x28, 0x52, 0x08, 0x00, 0x00,
  0x52, 0x45, 0x4D, 0x4F, 0x54, 0x45, 0x31  // "REMOTE1"
]);
const CMD_EXIT_REMOTE = new Uint8Array([
  0x1B, 0x28, 0x52, 0x04, 0x00, 0x00,
  0x45, 0x58, 0x49, 0x54  // "EXIT"
]);

// Счётчики памперса: пары lo+hi байт дают 16-битное значение
// Типичный максимум до остановки принтера — около 8192 (0x2000)
const COUNTERS = [
  { label: 'Основной памперс',  addrLo: 0x000D, addrHi: 0x000E, max: 0x2000 },
  { label: 'Второй памперс',    addrLo: 0x0010, addrHi: 0x0011, max: 0x2000 },
  { label: 'Третий памперс',    addrLo: 0x0062, addrHi: 0x0063, max: 0x0800 },
];

// ---- Построение команд Remote Mode ----

function wrapRemote(payload) {
  const packet = new Uint8Array(2 + payload.length);
  packet[0] = payload.length & 0xFF;
  packet[1] = (payload.length >> 8) & 0xFF;
  packet.set(payload, 2);
  const cmd = new Uint8Array(6 + packet.length);
  cmd.set([0x1B, 0x28, 0x52], 0);
  cmd[3] = packet.length & 0xFF;
  cmd[4] = (packet.length >> 8) & 0xFF;
  cmd[5] = 0x00;
  cmd.set(packet, 6);
  return cmd;
}

function buildEepromRead(address) {
  const payload = new Uint8Array([
    0x45, 0x45, 0x52,              // 'EE' + 'R'
    0x00, 0x00,
    address & 0xFF, (address >> 8) & 0xFF
  ]);
  return wrapRemote(payload);
}

function buildEepromWrite(address, value) {
  const payload = new Uint8Array([
    0x45, 0x45, 0x57,              // 'EE' + 'W'
    0x00, 0x00,
    address & 0xFF, (address >> 8) & 0xFF,
    value
  ]);
  return wrapRemote(payload);
}

// ---- Helpers ----

function findEndpoints(device, log) {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        let epOut = null, epIn = null;
        for (const ep of alt.endpoints) {
          log && log(`  Эндпойнт: ${ep.direction} #${ep.endpointNumber} тип=${ep.type} размер=${ep.packetSize}`);
          if (ep.type === 'bulk' && ep.direction === 'out') epOut = ep;
          if (ep.type === 'bulk' && ep.direction === 'in')  epIn  = ep;
        }
        if (epOut) return { iface, epOut, epIn };
      }
    }
  }
  throw new Error('Bulk OUT эндпойнт не найден');
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Обёртка с таймаутом — если принтер не ответил за ms, бросаем ошибку
function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Таймаут: принтер не ответил за ${ms / 1000} сек`)), ms)
    ),
  ]);
}

async function openDevice(device) {
  await withTimeout(device.open(), 6000);
  if (device.configuration === null)
    await withTimeout(device.selectConfiguration(1), 5000);
}

// ---- Публичное API ----

/**
 * Читает текущие значения счётчиков памперса.
 * Возвращает массив { label, value, max, percent }
 */
export async function readCounters(device, log) {
  log('Открытие устройства...');
  await openDevice(device);

  const { iface, epOut, epIn } = findEndpoints(device, log);
  log(`Захват интерфейса ${iface.interfaceNumber}...`);
  await withTimeout(device.claimInterface(iface.interfaceNumber), 6000);

  const results = [];

  try {
    log('Инициализация...');
    await withTimeout(device.transferOut(epOut.endpointNumber, CMD_INIT));
    await sleep(300);

    log('Вход в Remote Mode...');
    await withTimeout(device.transferOut(epOut.endpointNumber, CMD_ENTER_REMOTE));
    await sleep(200);

    for (const c of COUNTERS) {
      // Читаем lo-байт
      await withTimeout(device.transferOut(epOut.endpointNumber, buildEepromRead(c.addrLo)));
      await sleep(80);
      let lo = 0;
      if (epIn) {
        try {
          const resp = await withTimeout(device.transferIn(epIn.endpointNumber, 8), 2000);
          lo = resp.data ? resp.data.getUint8(resp.data.byteLength - 1) : 0;
        } catch (_) {}
      }

      // Читаем hi-байт
      await withTimeout(device.transferOut(epOut.endpointNumber, buildEepromRead(c.addrHi)));
      await sleep(80);
      let hi = 0;
      if (epIn) {
        try {
          const resp = await withTimeout(device.transferIn(epIn.endpointNumber, 8), 2000);
          hi = resp.data ? resp.data.getUint8(resp.data.byteLength - 1) : 0;
        } catch (_) {}
      }

      const value   = (hi << 8) | lo;
      const percent = Math.min(100, Math.round((value / c.max) * 100));
      results.push({ label: c.label, value, max: c.max, percent });
      log(`  ${c.label}: ${value} / ${c.max} (${percent}%)`);
    }

    log('Выход из Remote Mode...');
    await withTimeout(device.transferOut(epOut.endpointNumber, CMD_EXIT_REMOTE));
    await sleep(200);

  } finally {
    await device.releaseInterface(iface.interfaceNumber);
    await device.close();
  }

  return results;
}

/** Сбрасывает все счётчики памперса в 0. */
export async function resetWasteInk(device, log) {
  log('Открытие устройства...');
  await openDevice(device);

  const { iface, epOut } = findEndpoints(device, log);
  log(`Захват интерфейса ${iface.interfaceNumber}...`);
  await withTimeout(device.claimInterface(iface.interfaceNumber), 6000);

  try {
    log('Сброс USB-устройства...');
    try { await withTimeout(device.reset(), 4000); } catch (_) {}
    await sleep(300);

    log('Инициализация принтера (ESC @)...');
    await withTimeout(device.transferOut(epOut.endpointNumber, CMD_INIT));
    await sleep(300);

    log('Вход в Remote Mode...');
    await withTimeout(device.transferOut(epOut.endpointNumber, CMD_ENTER_REMOTE));
    await sleep(200);

    log('Сброс счётчиков EEPROM:');
    for (const c of COUNTERS) {
      for (const addr of [c.addrLo, c.addrHi]) {
        await withTimeout(device.transferOut(epOut.endpointNumber, buildEepromWrite(addr, 0x00)));
        await sleep(50);
      }
      log(`  ${c.label} → 0`);
    }

    log('Выход из Remote Mode...');
    await withTimeout(device.transferOut(epOut.endpointNumber, CMD_EXIT_REMOTE));
    await sleep(200);

    log('Готово!');
    return true;
  } finally {
    await device.releaseInterface(iface.interfaceNumber);
    await device.close();
  }
}
