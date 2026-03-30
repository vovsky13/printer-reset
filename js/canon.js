// Сброс и чтение счётчика памперса Canon через WebUSB

import { CANON_G_SERIES } from './detect.js';

// iP/MG/MP — сервисные команды
const SERVICE_ENTER    = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x1F]);
const SERVICE_EXIT     = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x00]);
const ABSORBER_RESET_1 = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x0F]);
const ABSORBER_RESET_2 = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x10]);

// Чтение счётчика поглотителя (iP/MG/MP)
const ABSORBER_READ_1  = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x03]);
const ABSORBER_READ_2  = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x04]);

// G-серия
const enc = new TextEncoder();
const PJL_RESET        = enc.encode('@PJL SET COUNTERS=PURGE\r\n');
const PJL_READ         = enc.encode('@PJL INFO COUNTERS\r\n');
const G_RESET          = new Uint8Array([0x1B, 0x43, 0x01, 0x00]);

// Типичный максимум счётчика до остановки принтера
const COUNTER_MAX = 6000;

function findEndpoints(device) {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        let epOut = null, epIn = null;
        for (const ep of alt.endpoints) {
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

function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Таймаут: принтер не ответил за ${ms / 1000} сек`)), ms)
    ),
  ]);
}

async function tryRead(device, epIn, maxBytes = 64) {
  if (!epIn) return null;
  try {
    const resp = await device.transferIn(epIn.endpointNumber, maxBytes);
    return resp.data;
  } catch (_) { return null; }
}

// ---- Публичное API ----

/**
 * Читает текущие значения счётчиков памперса Canon.
 * Возвращает массив { label, value, max, percent }
 */
export async function readCounters(device, log) {
  const pid = device.productId;

  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  const { iface, epOut, epIn } = findEndpoints(device);
  log(`Захват интерфейса ${iface.interfaceNumber}...`);
  await device.claimInterface(iface.interfaceNumber);

  const results = [];

  try {
    if (CANON_G_SERIES.has(pid)) {
      log('G-серия: запрос счётчика через PJL...');
      await withTimeout(device.transferOut(epOut.endpointNumber, PJL_READ));
      await sleep(400);
      const data = await tryRead(device, epIn, 256);

      let value = 0;
      if (data) {
        const text = new TextDecoder().decode(data);
        log(`  Ответ: ${text.trim()}`);
        // Ищем число в ответе (PURGE=XXXX или просто число)
        const m = text.match(/PURGE\s*=\s*(\d+)|(\d+)/);
        if (m) value = parseInt(m[1] || m[2], 10);
      }

      const percent = Math.min(100, Math.round((value / COUNTER_MAX) * 100));
      results.push({ label: 'Поглотитель (G-серия)', value, max: COUNTER_MAX, percent });
      log(`  Значение: ${value} / ${COUNTER_MAX} (${percent}%)`);

    } else {
      log('iP/MG/MP: вход в сервисный режим...');
      await withTimeout(device.transferOut(epOut.endpointNumber, SERVICE_ENTER));
      await sleep(300);

      for (const [i, cmd] of [[1, ABSORBER_READ_1], [2, ABSORBER_READ_2]]) {
        await withTimeout(device.transferOut(epOut.endpointNumber, cmd));
        await sleep(200);
        const data = await tryRead(device, epIn, 32);

        let value = 0;
        if (data && data.byteLength >= 2) {
          value = data.getUint8(0) | (data.getUint8(1) << 8);
        }

        const percent = Math.min(100, Math.round((value / COUNTER_MAX) * 100));
        results.push({ label: `Поглотитель ${i}`, value, max: COUNTER_MAX, percent });
        log(`  Поглотитель ${i}: ${value} / ${COUNTER_MAX} (${percent}%)`);
      }

      log('Выход из сервисного режима...');
      await withTimeout(device.transferOut(epOut.endpointNumber, SERVICE_EXIT));
      await sleep(200);
    }

  } finally {
    await device.releaseInterface(iface.interfaceNumber);
    await device.close();
  }

  return results;
}

/** Сбрасывает счётчики памперса. */
export async function resetWasteInk(device, log) {
  const pid = device.productId;

  log('Открытие устройства...');
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  const { iface, epOut } = findEndpoints(device);
  log(`Захват интерфейса ${iface.interfaceNumber}...`);
  await device.claimInterface(iface.interfaceNumber);

  try {
    if (CANON_G_SERIES.has(pid)) {
      log('G-серия (MegaTank) — сброс PJL...');
      await withTimeout(device.transferOut(epOut.endpointNumber, PJL_RESET));
      await sleep(300);
      await withTimeout(device.transferOut(epOut.endpointNumber, G_RESET));
      await sleep(200);
    } else {
      log('iP/MG/MP — вход в сервисный режим...');
      await withTimeout(device.transferOut(epOut.endpointNumber, SERVICE_ENTER));
      await sleep(300);
      log('Сброс основного счётчика...');
      await withTimeout(device.transferOut(epOut.endpointNumber, ABSORBER_RESET_1));
      await sleep(200);
      log('Сброс резервного счётчика...');
      await withTimeout(device.transferOut(epOut.endpointNumber, ABSORBER_RESET_2));
      await sleep(200);
      log('Выход из сервисного режима...');
      await withTimeout(device.transferOut(epOut.endpointNumber, SERVICE_EXIT));
      await sleep(200);
    }

    log('Готово!');
    return true;
  } finally {
    await device.releaseInterface(iface.interfaceNumber);
    await device.close();
  }
}
