const $ = id => document.getElementById(id);

const DEFAULTS = {
  rooms: 5, days: 30, averagePrice: 70, occupancy: 60,
  otaCommission: 23.5, agencyCommission: 20, minimumNet: 2000,
  desiredIncrease: 10, fixedCosts: 0, cleaningCost: 0, taxRate: 0,
  includeCleaning: false, includeFixedCosts: false, includeTaxes: false,
  language: 'it'
};

const STORAGE_KEY = 'affittacamere-current-v2';
const SCENARIOS_KEY = 'affittacamere-scenarios-v1';
const numericIds = ['rooms','days','averagePrice','occupancy','otaCommission','agencyCommission','minimumNet','desiredIncrease','fixedCosts','cleaningCost','taxRate'];
const checkIds = ['includeCleaning','includeFixedCosts','includeTaxes'];
const scenarioGrosses = [2000,4000,6000,8000,10000,12000];

function parseNumber(value) {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (!raw) return NaN;
  if (raw.includes(',') && raw.includes('.')) {
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    return lastComma > lastDot
      ? Number(raw.replace(/\./g, '').replace(',', '.'))
      : Number(raw.replace(/,/g, ''));
  }
  return Number(raw.replace(',', '.'));
}

const money = v => new Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR', minimumFractionDigits:2}).format(v);
const number = (v, max=2) => new Intl.NumberFormat('it-IT', {minimumFractionDigits:0, maximumFractionDigits:max}).format(v);
const percent = v => `${number(v, 2)}%`;

function readValues() {
  const v = {};
  numericIds.forEach(id => v[id] = parseNumber($(id).value));
  checkIds.forEach(id => v[id] = $(id).checked);
  v.language = $('language').value;
  return v;
}

function validate(v) {
  const errors = [];
  if (numericIds.some(id => Number.isNaN(v[id]))) errors.push('Compila tutti i campi numerici.');
  if (numericIds.some(id => Number.isFinite(v[id]) && v[id] < 0)) errors.push('Non sono ammessi valori negativi.');
  if (!(v.rooms > 0)) errors.push('Il numero di camere deve essere maggiore di zero.');
  if (!(v.days > 0)) errors.push('I giorni del mese devono essere maggiori di zero.');
  ['occupancy','otaCommission','agencyCommission','desiredIncrease','taxRate'].forEach(id => {
    if (Number.isFinite(v[id]) && (v[id] < 0 || v[id] > 100)) errors.push('Le percentuali devono essere comprese tra 0 e 100.');
  });
  if (Number.isFinite(v.otaCommission) && Number.isFinite(v.agencyCommission) && v.otaCommission + v.agencyCommission >= 100) {
    errors.push('La somma delle commissioni OTA e agenzia deve essere inferiore al 100%.');
  }
  return [...new Set(errors)];
}

function calculate(v, grossOverride = null) {
  const available = v.rooms * v.days;
  const sold = available * (v.occupancy / 100);
  const gross = grossOverride ?? sold * v.averagePrice;
  const autResidual = (100 - v.otaCommission) / 100;
  const agencyResidual = (100 - v.otaCommission - v.agencyCommission) / 100;
  const fixed = v.includeFixedCosts ? v.fixedCosts : 0;
  const cleaning = v.includeCleaning ? v.cleaningCost : 0;
  const taxFactor = v.includeTaxes ? 1 - v.taxRate / 100 : 1;
  const applyCosts = base => Math.max(0, base - fixed - cleaning) * taxFactor;
  const autNet = applyCosts(gross * autResidual);
  const agencyNet = applyCosts(gross * agencyResidual);
  const breakEvenGross = autNet / agencyResidual;
  const targetNet = autNet * (1 + v.desiredIncrease / 100);
  const higherGross = targetNet / agencyResidual;

  return {
    available, sold, avgOccupied: sold / v.days, gross,
    autResidual, agencyResidual,
    otaCost: gross * v.otaCommission / 100,
    agencyCost: gross * v.agencyCommission / 100,
    autNet, agencyNet, autAnnual: autNet * 12, agencyAnnual: agencyNet * 12,
    breakEvenGross, breakEvenEuro: breakEvenGross - gross, breakEvenPct: (breakEvenGross / gross - 1) * 100,
    targetNet, higherGross, higherEuro: higherGross - gross, higherPct: (higherGross / gross - 1) * 100,
    goalGrossAut: v.minimumNet / autResidual,
    goalGrossAgency: v.minimumNet / agencyResidual
  };
}

function setText(id, value) { $(id).textContent = value; }

function showErrors(list) {
  const box = $('errorBox');
  box.style.display = list.length ? 'block' : 'none';
  box.textContent = list.join(' ');
}

function saveCurrent(v) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {}
}

function updateTables(v) {
  $('scenarioTableBody').innerHTML = scenarioGrosses.map(g => {
    const r = calculate(v, g);
    return `<tr><td>${money(g)}</td><td>${money(r.autNet)}</td><td>${money(r.agencyNet)}</td><td>${money(r.autNet-r.agencyNet)}</td><td>${percent(r.autResidual*100)}</td><td>${percent(r.agencyResidual*100)}</td></tr>`;
  }).join('');

  $('breakEvenTableBody').innerHTML = scenarioGrosses.map(g => {
    const r = calculate(v, g);
    return `<tr><td>${money(g)}</td><td>${money(r.autNet)}</td><td>${money(r.breakEvenGross)}</td><td>${money(r.breakEvenEuro)}</td><td>${percent(r.breakEvenPct)}</td></tr>`;
  }).join('');
}

function update() {
  const v = readValues();
  const validationErrors = validate(v);
  showErrors(validationErrors);
  saveCurrent(v);
  if (validationErrors.length) return false;

  const r = calculate(v);
  setText('availableNights', number(r.available));
  setText('soldNights', number(r.sold));
  setText('averageOccupiedRooms', number(r.avgOccupied));
  setText('grossRevenue', money(r.gross));
  setText('simAutonomousNet', money(r.autNet));
  setText('simAutonomousAnnual', money(r.autAnnual));
  setText('simAgencyNet', money(r.agencyNet));
  setText('simAgencyAnnual', money(r.agencyAnnual));
  setText('autGross', money(r.gross));
  setText('autOtaCost', money(r.otaCost));
  setText('autResidual', percent(r.autResidual*100));
  setText('autNet', money(r.autNet));
  setText('autAnnual', money(r.autAnnual));
  setText('agencyGross', money(r.gross));
  setText('agencyOtaCost', money(r.otaCost));
  setText('agencyCost', money(r.agencyCost));
  setText('agencyTotalCost', money(r.otaCost+r.agencyCost));
  setText('agencyResidual', percent(r.agencyResidual*100));
  setText('agencyNet', money(r.agencyNet));
  setText('agencyAnnual', money(r.agencyAnnual));
  setText('breakEvenAutNet', money(r.autNet));
  setText('breakEvenAgencyGross', money(r.breakEvenGross));
  setText('breakEvenIncreaseEuro', money(r.breakEvenEuro));
  setText('breakEvenIncreasePercent', percent(r.breakEvenPct));
  setText('higherTargetNet', money(r.targetNet));
  setText('higherAgencyGross', money(r.higherGross));
  setText('higherIncreaseEuro', money(r.higherEuro));
  setText('higherIncreasePercent', percent(r.higherPct));
  setText('goalNetAut', money(v.minimumNet));
  setText('goalGrossAut', money(r.goalGrossAut));
  setText('goalNetAgency', money(v.minimumNet));
  setText('goalGrossAgency', money(r.goalGrossAgency));

  const delta = r.agencyNet - v.minimumNet;
  const status = $('goalStatus');
  status.className = 'status ' + (delta >= 0 ? 'good' : delta >= -v.minimumNet * 0.1 ? 'warning' : 'bad');
  status.textContent = delta >= 0
    ? `Obiettivo raggiunto: superato di ${money(delta)}.`
    : `Obiettivo non raggiunto: mancano ${money(-delta)}.`;

  updateTables(v);
  return true;
}

let updateTimer;
function scheduleUpdate() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(update, 120);
}

function apply(v) {
  numericIds.forEach(id => $(id).value = String(v[id] ?? DEFAULTS[id]).replace('.', ','));
  checkIds.forEach(id => $(id).checked = Boolean(v[id]));
  $('language').value = v.language || 'it';
  update();
}

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    apply({...DEFAULTS, ...stored});
  } catch {
    apply(DEFAULTS);
  }
}

function reset() {
  localStorage.removeItem(STORAGE_KEY);
  apply(DEFAULTS);
  $('generatedMessage').value = '';
  $('scenarioName').value = '';
}

function scenarios() {
  try { return JSON.parse(localStorage.getItem(SCENARIOS_KEY) || '[]'); }
  catch { return []; }
}
function storeScenarios(list) { localStorage.setItem(SCENARIOS_KEY, JSON.stringify(list)); }
function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function renderScenarios() {
  const list = scenarios();
  const root = $('scenarioList');
  if (!list.length) { root.innerHTML = '<div class="hint">Nessuno scenario salvato.</div>'; return; }
  root.innerHTML = '';
  list.forEach(s => {
    const el = document.createElement('div');
    el.className = 'scenario-item';
    el.innerHTML = `<div><strong>${escapeHtml(s.name)}</strong><div class="meta">${new Date(s.createdAt).toLocaleString('it-IT')}</div></div><div class="scenario-actions"><button class="btn-secondary">Carica</button><button class="btn-danger">Elimina</button></div>`;
    const [loadBtn, delBtn] = el.querySelectorAll('button');
    loadBtn.onclick = () => apply({...DEFAULTS, ...s.values});
    delBtn.onclick = () => { storeScenarios(list.filter(x => x.id !== s.id)); renderScenarios(); };
    root.appendChild(el);
  });
}

function saveScenario() {
  const name = $('scenarioName').value.trim();
  const v = readValues();
  const e = validate(v);
  if (!name) e.push('Inserisci un nome per lo scenario.');
  showErrors(e);
  if (e.length) return;
  const list = scenarios();
  list.unshift({id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, createdAt: new Date().toISOString(), values: v});
  storeScenarios(list);
  $('scenarioName').value = '';
  renderScenarios();
}

function italian(v,r) {
  const ok = r.agencyNet >= v.minimumNet;
  return `Abbiamo simulato un affittacamere con ${number(v.rooms)} camere e ${number(v.days)} giorni di attività nel mese.\n\nLe notti disponibili sono ${number(r.available)}. Con un'occupazione media del ${percent(v.occupancy)}, vengono vendute circa ${number(r.sold)} notti, cioè una media di ${number(r.avgOccupied)} camere occupate ogni giorno.\n\nCon un prezzo medio di ${money(v.averagePrice)} a notte, il fatturato lordo mensile è di ${money(r.gross)}.\n\nNella gestione autonoma, Booking o gli altri portali trattengono il ${percent(v.otaCommission)}, cioè ${money(r.otaCost)}. Il netto stimato rimane quindi ${money(r.autNet)} al mese.\n\nCon la gestione tramite agenzia, oltre alla trattenuta OTA del ${percent(v.otaCommission)}, si aggiunge la commissione agenzia del ${percent(v.agencyCommission)}, pari a ${money(r.agencyCost)}. Il netto stimato diventa ${money(r.agencyNet)} al mese.\n\nPer lasciare lo stesso netto della gestione autonoma, l'agenzia dovrebbe produrre almeno ${money(r.breakEvenGross)} di lordo, cioè il ${percent(r.breakEvenPct)} in più.\n\nPer ottenere un netto superiore del ${percent(v.desiredIncrease)}, l'agenzia dovrebbe produrre circa ${money(r.higherGross)} di lordo.\n\n${ok ? `L'obiettivo minimo di ${money(v.minimumNet)} è raggiunto.` : `L'obiettivo minimo di ${money(v.minimumNet)} non è raggiunto: mancano ${money(v.minimumNet-r.agencyNet)}.`}`;
}

function bangla(v,r) {
  const ok = r.agencyNet >= v.minimumNet;
  return `আমরা ${number(v.rooms)}টি কক্ষ এবং মাসে ${number(v.days)} দিনের ভিত্তিতে হিসাব করেছি।\n\nমোট উপলভ্য রাত ${number(r.available)}। গড় দখল হার ${percent(v.occupancy)} হলে প্রায় ${number(r.sold)} রাত বিক্রি হয়, অর্থাৎ প্রতিদিন গড়ে ${number(r.avgOccupied)}টি কক্ষ ভাড়া থাকে।\n\nপ্রতি রাতের গড় মূল্য ${money(v.averagePrice)} হলে মাসিক মোট আয় হয় ${money(r.gross)}।\n\nনিজে পরিচালনা করলে Booking বা OTA ${percent(v.otaCommission)} কমিশন রাখে, অর্থাৎ ${money(r.otaCost)}। আনুমানিক মাসিক নেট আয় থাকে ${money(r.autNet)}।\n\nএজেন্সির মাধ্যমে পরিচালনা করলে OTA কমিশনের সঙ্গে এজেন্সির ${percent(v.agencyCommission)} কমিশন যোগ হয়, যার পরিমাণ ${money(r.agencyCost)}। তখন আনুমানিক মাসিক নেট আয় হয় ${money(r.agencyNet)}।\n\nনিজে পরিচালনার সমান নেট আয় দিতে এজেন্সিকে অন্তত ${money(r.breakEvenGross)} মোট আয় করতে হবে, অর্থাৎ ${percent(r.breakEvenPct)} বেশি।\n\n${percent(v.desiredIncrease)} বেশি নেট আয় পেতে এজেন্সিকে প্রায় ${money(r.higherGross)} মোট আয় করতে হবে।\n\n${ok ? `${money(v.minimumNet)}-এর ন্যূনতম লক্ষ্য পূরণ হয়েছে।` : `${money(v.minimumNet)}-এর ন্যূনতম লক্ষ্য পূরণ হয়নি। ঘাটতি ${money(v.minimumNet-r.agencyNet)}।`}`;
}

function generate() {
  const v = readValues();
  const e = validate(v);
  showErrors(e);
  if (e.length) return;
  const r = calculate(v);
  $('generatedMessage').value = v.language === 'bn' ? bangla(v,r) : italian(v,r);
}

async function copy() {
  if (!$('generatedMessage').value.trim()) generate();
  const text = $('generatedMessage').value;
  if (!text) return;
  try { await navigator.clipboard.writeText(text); }
  catch { $('generatedMessage').select(); document.execCommand('copy'); }
  const c = $('copyConfirmation');
  c.style.display = 'inline';
  setTimeout(() => c.style.display = 'none', 1600);
}

function addCalculateButton() {
  const toolbar = document.querySelector('.toolbar');
  if (!toolbar || $('calculateBtn')) return;
  const button = document.createElement('button');
  button.id = 'calculateBtn';
  button.type = 'button';
  button.className = 'btn-primary';
  button.textContent = 'Calcola ora';
  button.addEventListener('click', update);
  toolbar.prepend(button);
}

function bindEvents() {
  numericIds.forEach(id => {
    const el = $(id);
    ['input','change','blur'].forEach(evt => el.addEventListener(evt, scheduleUpdate));
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); update(); el.blur(); }
    });
  });
  checkIds.forEach(id => $(id).addEventListener('change', update));
  $('language').addEventListener('change', () => { update(); if ($('generatedMessage').value) generate(); });
  $('resetBtn').addEventListener('click', reset);
  $('saveScenarioBtn').addEventListener('click', saveScenario);
  $('generateMessageBtn').addEventListener('click', generate);
  $('copyMessageBtn').addEventListener('click', copy);
  $('scrollMessageBtn').addEventListener('click', () => $('messageSection').scrollIntoView({behavior:'smooth'}));
}

addCalculateButton();
bindEvents();
load();
renderScenarios();

const test = calculate(DEFAULTS);
console.assert(test.available === 150 && Math.abs(test.sold-90) < .01 && Math.abs(test.avgOccupied-3) < .01 && Math.abs(test.gross-6300) < .01 && Math.abs(test.autNet-4819.5) < .01 && Math.abs(test.agencyNet-3559.5) < .01, 'Test iniziale fallito');
const test6000 = calculate(DEFAULTS, 6000);
console.assert(Math.abs(test6000.autNet-4590) < .01 && Math.abs(test6000.breakEvenGross-8123.89) < .1 && Math.abs(test6000.higherGross-8936.28) < .1, 'Test 6000 fallito');