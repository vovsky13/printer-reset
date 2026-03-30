// Сброс счётчика памперса Epson через WebUSB
// Протокол: ESC/P2 Remote Mode (REMOTE1) + команда EE W (запись EEPROM)

const CMD_INIT         = new Uint8Array([0x1B, 0x40]); // ESC @
const CMD_ENTER_REMOTE = new Uint8Array([
  0x1B, 0x28, 0x52, 0x08, 0x00, 0x00,
  0x52, 0x45, 0x4D, 0x4F, 0x54, 0x45, 0x31  // "REMOTE1"
]);
const CMD_EXIT_REMOTE = new Uint8Array([
  0x1B, 0x28, 0x52, 0x04, 0x00, 0x00,
  0x45, 0x58, 0x49, 0x54  // "EXIT"
]);

// Адреса EEPROM счётчиков памперса (большинство моделей Epson)
const WASTE_INK_ADDRESSES = [
  { name: 'Основной (lo)',    addr: 0x000D },
  { name: 'Основной (hi)',    addr: 0x000E },
  { name: 'Второй (lo)',      addr: 0x0010 },
  { name: 'Второй (hi)',      addr: 0x0011 },
  { name: 'Третий (lo)',      addr: 0x0062 },
  { name: 'Третий (hi)',      addr: 0x0063 },
];

function buildEepromWrite(address, value) {
  // payload: EE + W + 0x00 0x00 + addr_lo + addr_hi + value
  const addrLo = address & 0xFF;
  const addrHi = (address >> 8) & 0xFF;
  const payload = new Uint8Array([0x45, 0x45, 0x57, 0x00, 0x00, addrLo, addrHi, value]);

  // packet: 2 байта длины payload (LE) + payload
  const packet = new Uint8Array(2 + payload.length);
  packet[0] = payload.length & 0xFF;
  packet[1] = (payload.length >> 8) & 0xFF;
  packet.set(payload, 2);

  // cmd: ESC ( R + 2 байта длины packet (LE) + 0x00 + packet
  const cmd = new Uint8Array(3 + 2 + 1 + packet.length);
  cmd.set([0x1B, 0x28, 0x52], 0);
  cmd[3] = packet.length & 0xFF;
  cmd[4] = (packet.length >> 8) & 0xFF;
  cmd[5] = 0x00;
  cmd.set(packet, 6);
  return cmd;
}

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
  log('Открытие устройства...');
  await device.open();

  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }

  const { iface, ep } = await findBulkOut(device);
  log(`Захват интерфейса ${iface.interfaceNumber}...`);
  await device.claimInterface(iface.interfaceNumber);

  try {
    log('Инициализация принтера (ESC @)...');
    await device.transferOut(ep.endpointNumber, CMD_INIT);
    await sleep(300);

    log('Вход в Remote Mode...');
    await device.transferOut(ep.endpointNumber, CMD_ENTER_REMOTE);
    await sleep(200);

    log('Сброс счётчиков EEPROM:');
    for (const { name, addr } of WASTE_INK_ADDRESSES) {
      const cmd = buildEepromWrite(addr, 0x00);
      await device.transferOut(ep.endpointNumber, cmd);
      await sleep(50);
      log(`  Адрес 0x${addr.toString(16).padStart(4,'0').toUpperCase()} (${name}) → 0x00`);
    }

    log('Выход из Remote Mode...');
    await device.transferOut(ep.endpointNumber, CMD_EXIT_REMOTE);
    await sleep(200);

    log('Готово!');
    return true;
  } finally {
    await device.releaseInterface(iface.interfaceNumber);
    await device.close();
  }
}
