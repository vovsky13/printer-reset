// Сброс счётчика памперса Canon через WebUSB
// iP/MG/MP серия — сервисные ESC-команды
// G-серия (MegaTank) — PJL-команда

import { CANON_G_SERIES } from './detect.js';

// iP/MG/MP — сервисные команды
const SERVICE_ENTER    = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x1F]);
const SERVICE_EXIT     = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x00]);
const ABSORBER_RESET_1 = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x0F]);
const ABSORBER_RESET_2 = new Uint8Array([0x1B, 0x5B, 0x4B, 0x02, 0x00, 0x00, 0x10]);

// G-серия — PJL
const enc = new TextEncoder();
const PJL_RESET = enc.encode('@PJL SET COUNTERS=PURGE\r\n');
const G_RESET   = new Uint8Array([0x1B, 0x43, 0x01, 0x00]);

async function findBulkOut(device) {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        for (const ep of alt.endpoints) {
          if (ep.type === 'bulk' && ep.direction === 'out') {
            return { iface, ep };
          }
        }
      }
    }
  }
  throw new Error('Bulk OUT эндпойнт не найден');
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function resetWasteInk(device, log) {
  const pid = device.productId;

  log('Открытие устройства...');
  await device.open();

  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }

  const { iface, ep } = await findBulkOut(device);
  log(`Захват интерфейса ${iface.interfaceNumber}...`);
  await device.claimInterface(iface.interfaceNumber);

  try {
    if (CANON_G_SERIES.has(pid)) {
      log('Серия G (MegaTank) — сброс PJL...');
      await device.transferOut(ep.endpointNumber, PJL_RESET);
      await sleep(300);
      await device.transferOut(ep.endpointNumber, G_RESET);
      await sleep(200);
    } else {
      log('Серия iP/MG/MP — вход в сервисный режим...');
      await device.transferOut(ep.endpointNumber, SERVICE_ENTER);
      await sleep(300);

      log('Сброс основного счётчика поглотителя...');
      await device.transferOut(ep.endpointNumber, ABSORBER_RESET_1);
      await sleep(200);

      log('Сброс резервного счётчика поглотителя...');
      await device.transferOut(ep.endpointNumber, ABSORBER_RESET_2);
      await sleep(200);

      log('Выход из сервисного режима...');
      await device.transferOut(ep.endpointNumber, SERVICE_EXIT);
      await sleep(200);
    }

    log('Готово!');
    return true;
  } finally {
    await device.releaseInterface(iface.interfaceNumber);
    await device.close();
  }
}
