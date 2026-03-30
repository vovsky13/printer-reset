import { EPSON_VID, CANON_VID, printerName, requestPrinter, getConnectedPrinters } from './detect.js';
import { resetWasteInk as epsonReset, readCounters as epsonRead } from './epson.js';
import { resetWasteInk as canonReset, readCounters as canonRead } from './canon.js';

// --- DOM ---
const btnAdd        = document.getElementById('btn-add');
const btnScan       = document.getElementById('btn-scan');
const btnCheck      = document.getElementById('btn-check');
const btnReset      = document.getElementById('btn-reset');
const btnResetAll   = document.getElementById('btn-reset-all');
const printerList   = document.getElementById('printer-list');
const logEl         = document.getElementById('log');
const statusEl      = document.getElementById('status');
const noUsb         = document.getElementById('no-usb');
const webUsbBlock   = document.getElementById('webusbblock');
const countersCard  = document.getElementById('counters-card');
const countersList  = document.getElementById('counters-list');
const progressCard  = document.getElementById('progress-card');
const progressBar   = document.getElementById('progress-bar');
const progressLbl   = document.getElementById('progress-label');
const resultCard    = document.getElementById('result-card');
const resultIcon    = document.getElementById('result-icon');
const resultTitle   = document.getElementById('result-title');
const resultSub     = document.getElementById('result-sub');

// --- State ---
let printers = [];
let nextId = 0;

// --- WebUSB check ---
if (!navigator.usb) {
  webUsbBlock.style.display = 'block';
  [btnAdd, btnScan, btnCheck, btnReset, btnResetAll].forEach(b => b.disabled = true);
}

// --- Log ---
function log(msg, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function clearLog() { logEl.innerHTML = ''; }
function setStatus(msg) { statusEl.textContent = msg; }

// --- Printer list UI ---
function renderList() {
  printerList.innerHTML = '';
  if (printers.length === 0) {
    noUsb.style.display = 'flex';
    [btnCheck, btnReset, btnResetAll].forEach(b => b.disabled = true);
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
      updateSelectionBtns();
    });
    printerList.appendChild(item);
  });
}

function updateSelectionBtns() {
  const any = [...document.querySelectorAll('.printer-check')].some(c => c.checked);
  btnReset.disabled = !any;
  btnCheck.disabled = !any;
}

function addPrinter(device) {
  if (printers.find(p => p.device === device)) return;
  printers.push({ device, name: printerName(device.vendorId, device.productId), id: nextId++ });
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
    if (e.name !== 'NotFoundError') log(`Ошибка выбора: ${e.message}`, 'error');
  }
});

btnScan.addEventListener('click', async () => {
  clearLog();
  log('Сканирование ранее разрешённых устройств...');
  setStatus('Сканирование...');
  const devices = await getConnectedPrinters();
  if (devices.length === 0) {
    log('Принтеры не найдены. Нажмите «Добавить принтер».', 'warn');
    setStatus('Не найдено');
  } else {
    devices.forEach(d => addPrinter(d));
    log(`Найдено ${devices.length} принтер(ов).`, 'success');
    setStatus(`Найдено: ${devices.length}`);
  }
});

// --- Check (читаем заполненность) ---
function fillColor(pct) {
  if (pct >= 90) return '#e63946';
  if (pct >= 70) return '#f0a500';
  return '#2ecc71';
}

function renderCounters(printerName, counters) {
  const block = document.createElement('div');
  block.className = 'counter-block';

  const title = document.createElement('div');
  title.className = 'counter-printer-name';
  title.textContent = printerName;
  block.appendChild(title);

  for (const c of counters) {
    const row = document.createElement('div');
    row.className = 'counter-row';

    const color = fillColor(c.percent);
    const warn  = c.percent >= 90 ? ' ⚠️' : c.percent >= 70 ? ' ⚡' : '';

    row.innerHTML = `
      <div class="counter-label">${c.label}${warn}</div>
      <div class="counter-bar-wrap">
        <div class="counter-bar" style="width:${c.percent}%;background:${color}"></div>
      </div>
      <div class="counter-pct" style="color:${color}">${c.percent}%</div>
      <div class="counter-raw">${c.value} / ${c.max}</div>
    `;
    block.appendChild(row);
  }

  countersList.appendChild(block);
}

async function doCheck(targets) {
  clearLog();
  countersCard.style.display = 'none';
  countersList.innerHTML = '';
  resultCard.style.display = 'none';
  [btnAdd, btnScan, btnCheck, btnReset, btnResetAll].forEach(b => b.disabled = true);
  setStatus('Чтение счётчиков...');

  for (const p of targets) {
    log(`\n▶ ${p.name}`, 'header');
    const logFn = msg => log(`  ${msg}`);
    try {
      const counters = p.device.vendorId === EPSON_VID
        ? await epsonRead(p.device, logFn)
        : await canonRead(p.device, logFn);

      renderCounters(p.name, counters);
      countersCard.style.display = 'block';
    } catch (e) {
      log(`  Ошибка чтения: ${e.message}`, 'error');
    }
  }

  setStatus('Готов');
  [btnAdd, btnScan, btnResetAll].forEach(b => b.disabled = false);
  updateSelectionBtns();
}

btnCheck.addEventListener('click', () => {
  const ids = [...document.querySelectorAll('.printer-check:checked')].map(c => +c.dataset.id);
  const targets = printers.filter(p => ids.includes(p.id));
  if (targets.length) doCheck(targets);
});

// --- Progress / Result ---
function showProgress(label, pct) {
  progressCard.style.display = 'block';
  resultCard.style.display = 'none';
  progressLbl.textContent = label;
  progressBar.style.width = pct + '%';
}

function showResult(ok, fail) {
  progressCard.style.display = 'none';
  resultCard.style.display = 'block';
  resultCard.className = 'card result-card ' + (fail === 0 ? 'result-success' : 'result-error');
  if (fail === 0) {
    resultIcon.textContent  = '✅';
    resultTitle.textContent = `Счётчик сброшен на ${ok} принтере(ах)!`;
    resultSub.textContent   = 'Выключите принтер, подождите 10 секунд и включите снова.';
  } else {
    resultIcon.textContent  = '❌';
    resultTitle.textContent = `Ошибок: ${fail}, успешно: ${ok}`;
    resultSub.textContent   = 'Смотрите лог операций для деталей.';
  }
}

// --- Reset ---
async function doReset(targets) {
  clearLog();
  countersCard.style.display = 'none';
  resultCard.style.display = 'none';
  [btnAdd, btnScan, btnCheck, btnReset, btnResetAll].forEach(b => b.disabled = true);
  showProgress('Подключение к принтеру...', 5);
  log('Начинаем сброс...', 'header');
  await new Promise(r => setTimeout(r, 50)); // дать браузеру отрисовать UI

  let ok = 0, fail = 0;
  const total = targets.length;

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    showProgress(`Сброс: ${p.name}`, Math.round((i / total) * 90));
    log(`\n▶ ${p.name}`, 'header');
    setStatus(`Сброс: ${p.name}`);

    const logFn = msg => { log(`  ${msg}`); progressLbl.textContent = msg.trim(); };

    try {
      p.device.vendorId === EPSON_VID
        ? await epsonReset(p.device, logFn)
        : await canonReset(p.device, logFn);
      log('  Счётчик сброшен успешно.', 'success');
      ok++;
    } catch (e) {
      log(`  Ошибка: ${e.message}`, 'error');
      fail++;
    }
  }

  showProgress('Завершено', 100);
  await new Promise(r => setTimeout(r, 500));

  log(`\nИтог: успешно ${ok}, ошибок ${fail}.`, fail === 0 ? 'success' : 'warn');
  setStatus(`Готово: ОК ${ok}, ошибок ${fail}`);
  showResult(ok, fail);

  [btnAdd, btnScan, btnResetAll].forEach(b => b.disabled = false);
  if (printers.length > 0) updateSelectionBtns();
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

// Авто-сканирование при загрузке
window.addEventListener('load', () => { if (navigator.usb) btnScan.click(); });
