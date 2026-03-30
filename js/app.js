import { EPSON_VID, CANON_VID, printerName, requestPrinter, getConnectedPrinters } from './detect.js';
import { resetWasteInk as epsonReset } from './epson.js';
import { resetWasteInk as canonReset } from './canon.js';

// --- DOM ---
const btnAdd      = document.getElementById('btn-add');
const btnScan     = document.getElementById('btn-scan');
const btnReset    = document.getElementById('btn-reset');
const btnResetAll = document.getElementById('btn-reset-all');
const printerList = document.getElementById('printer-list');
const logEl       = document.getElementById('log');
const statusEl    = document.getElementById('status');
const noUsb       = document.getElementById('no-usb');
const webUsbBlock = document.getElementById('webusbblock');

// --- State ---
let printers = [];  // { device, name, id }
let nextId = 0;

// --- WebUSB check ---
if (!navigator.usb) {
  webUsbBlock.style.display = 'block';
  [btnAdd, btnScan, btnReset, btnResetAll].forEach(b => b.disabled = true);
}

// --- Log ---
function log(msg, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function clearLog() {
  logEl.innerHTML = '';
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

// --- Printer list UI ---
function renderList() {
  printerList.innerHTML = '';
  if (printers.length === 0) {
    noUsb.style.display = 'flex';
    btnReset.disabled = true;
    btnResetAll.disabled = true;
    return;
  }
  noUsb.style.display = 'none';
  btnResetAll.disabled = false;

  printers.forEach(p => {
    const item = document.createElement('div');
    item.className = 'printer-item';
    item.dataset.id = p.id;
    item.innerHTML = `
      <input type="checkbox" class="printer-check" data-id="${p.id}">
      <span class="printer-icon">${p.device.vendorId === EPSON_VID ? '🖨' : '🖨'}</span>
      <span class="printer-name">${p.name}</span>
      <span class="printer-vendor ${p.device.vendorId === EPSON_VID ? 'badge-epson' : 'badge-canon'}">
        ${p.device.vendorId === EPSON_VID ? 'EPSON' : 'CANON'}
      </span>
    `;
    item.addEventListener('click', e => {
      if (e.target.type !== 'checkbox') {
        const cb = item.querySelector('.printer-check');
        cb.checked = !cb.checked;
      }
      updateResetBtn();
    });
    printerList.appendChild(item);
  });
}

function updateResetBtn() {
  const any = [...document.querySelectorAll('.printer-check')].some(c => c.checked);
  btnReset.disabled = !any;
}

function addPrinter(device) {
  const existing = printers.find(p => p.device === device);
  if (existing) return;
  printers.push({
    device,
    name: printerName(device.vendorId, device.productId),
    id: nextId++,
  });
  renderList();
}

// --- Add / Scan ---
btnAdd.addEventListener('click', async () => {
  try {
    const device = await requestPrinter();
    addPrinter(device);
    log(`Добавлен: ${printerName(device.vendorId, device.productId)}`, 'success');
    setStatus('Принтер добавлен');
  } catch (e) {
    if (e.name !== 'NotFoundError') {
      log(`Ошибка выбора: ${e.message}`, 'error');
    }
  }
});

btnScan.addEventListener('click', async () => {
  clearLog();
  log('Сканирование ранее разрешённых устройств...');
  setStatus('Сканирование...');
  const devices = await getConnectedPrinters();
  if (devices.length === 0) {
    log('Принтеры не найдены. Нажмите «Добавить принтер» и выберите из списка.', 'warn');
    setStatus('Не найдено');
  } else {
    devices.forEach(d => addPrinter(d));
    log(`Найдено ${devices.length} принтер(ов).`, 'success');
    setStatus(`Найдено: ${devices.length}`);
  }
});

// --- Reset ---
async function doReset(targets) {
  clearLog();
  [btnAdd, btnScan, btnReset, btnResetAll].forEach(b => b.disabled = true);

  let ok = 0, fail = 0;

  for (const p of targets) {
    log(`\n▶ ${p.name}`, 'header');
    setStatus(`Сброс: ${p.name}`);
    const logFn = msg => log(`  ${msg}`);
    try {
      if (p.device.vendorId === EPSON_VID) {
        await epsonReset(p.device, logFn);
      } else {
        await canonReset(p.device, logFn);
      }
      log(`  Счётчик сброшен успешно.`, 'success');
      ok++;
    } catch (e) {
      log(`  Ошибка: ${e.message}`, 'error');
      fail++;
    }
  }

  log(`\nИтог: успешно ${ok}, ошибок ${fail}.`, fail === 0 ? 'success' : 'warn');
  setStatus(`Готово: ОК ${ok}, ошибок ${fail}`);

  [btnAdd, btnScan, btnResetAll].forEach(b => b.disabled = false);
  if (printers.length > 0) updateResetBtn();

  if (fail === 0) {
    showToast(`Сброс выполнен на ${ok} принтере(ах). Выключите и включите принтер!`, 'success');
  } else {
    showToast(`Ошибок: ${fail}. Смотрите лог.`, 'error');
  }
}

btnReset.addEventListener('click', () => {
  const ids = [...document.querySelectorAll('.printer-check:checked')].map(c => +c.dataset.id);
  const targets = printers.filter(p => ids.includes(p.id));
  if (targets.length && confirm(`Сбросить счётчик памперса на ${targets.length} принтере(ах)?`)) {
    doReset(targets);
  }
});

btnResetAll.addEventListener('click', () => {
  if (printers.length && confirm(`Сбросить счётчик на ВСЕХ ${printers.length} принтере(ах)?`)) {
    doReset(printers);
  }
});

// --- Toast ---
function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('toast-show'), 10);
  setTimeout(() => {
    t.classList.remove('toast-show');
    setTimeout(() => t.remove(), 400);
  }, 4000);
}

// Авто-сканирование при загрузке
window.addEventListener('load', () => {
  if (navigator.usb) btnScan.click();
});
