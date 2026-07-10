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

const fieldMeta = {
  rooms: {label:'Numero di camere', sections:['Riepilogo decisionale','Occupazione necessaria','Simulatore camere','Confronto dettagliato','Pareggio','Obiettivo netto']},
  days: {label:'Giorni del mese', sections:['Riepilogo decisionale','Occupazione necessaria','Simulatore camere','Confronto dettagliato','Pareggio','Obiettivo netto']},
  averagePrice: {label:'Prezzo medio per notte', sections:['Riepilogo decisionale','Occupazione necessaria','Simulatore camere','Confronto dettagliato','Pareggio','Obiettivo netto']},
  occupancy: {label:'Occupazione media', sections:['Riepilogo decisionale','Simulatore camere','Confronto dettagliato','Pareggio']},
  otaCommission: {label:'Commissione Booking/OTA', sections:['Riepilogo decisionale','Occupazione necessaria','Confronto dettagliato','Pareggio','Obiettivo netto']},
  agencyCommission: {label:'Commissione agenzia', sections:['Riepilogo decisionale','Occupazione necessaria','Gestione tramite agenzia','Pareggio','Obiettivo netto']},
  minimumNet: {label:'Obiettivo netto mensile', sections:['Riepilogo decisionale','Occupazione necessaria','Obiettivo netto minimo']},
  desiredIncrease: {label:'Incremento netto desiderato', sections:['Pareggio e guadagno superiore']},
  fixedCosts: {label:'Costi fissi mensili', sections:['Riepilogo decisionale','Occupazione necessaria','Tutti i netti']},
  cleaningCost: {label:'Costo pulizie', sections:['Riepilogo decisionale','Occupazione necessaria','Tutti i netti']},
  taxRate: {label:'Imposte', sections:['Riepilogo decisionale','Occupazione necessaria','Tutti i netti']},
  includeCleaning: {label:'Inclusione pulizie', sections:['Riepilogo decisionale','Occupazione necessaria','Tutti i netti']},
  includeFixedCosts: {label:'Inclusione costi fissi', sections:['Riepilogo decisionale','Occupazione necessaria','Tutti i netti']},
  includeTaxes: {label:'Inclusione imposte', sections:['Riepilogo decisionale','Occupazione necessaria','Tutti i netti']}
};

function parseNumber(value) {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (!raw) return NaN;
  if (raw.includes(',') && raw.includes('.')) {
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    return lastComma > lastDot ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw.replace(/,/g, ''));
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
    available, sold, avgOccupied: sold / v.days, gross, autResidual, agencyResidual,
    otaCost: gross * v.otaCommission / 100, agencyCost: gross * v.agencyCommission / 100,
    autNet, agencyNet, autAnnual: autNet * 12, agencyAnnual: agencyNet * 12,
    breakEvenGross, breakEvenEuro: breakEvenGross - gross, breakEvenPct: (breakEvenGross / gross - 1) * 100,
    targetNet, higherGross, higherEuro: higherGross - gross, higherPct: (higherGross / gross - 1) * 100,
    goalGrossAut: v.minimumNet / autResidual, goalGrossAgency: v.minimumNet / agencyResidual
  };
}

function setText(id, value) { const el = $(id); if (el) el.textContent = value; }
function showErrors(list) { const box = $('errorBox'); box.style.display = list.length ? 'block' : 'none'; box.textContent = list.join(' '); }
function saveCurrent(v) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {} }

function updateTables(v) {
  $('scenarioTableBody').innerHTML = scenarioGrosses.map(g => { const r = calculate(v,g); return `<tr><td>${money(g)}</td><td>${money(r.autNet)}</td><td>${money(r.agencyNet)}</td><td>${money(r.autNet-r.agencyNet)}</td><td>${percent(r.autResidual*100)}</td><td>${percent(r.agencyResidual*100)}</td></tr>`; }).join('');
  $('breakEvenTableBody').innerHTML = scenarioGrosses.map(g => { const r = calculate(v,g); return `<tr><td>${money(g)}</td><td>${money(r.autNet)}</td><td>${money(r.breakEvenGross)}</td><td>${money(r.breakEvenEuro)}</td><td>${percent(r.breakEvenPct)}</td></tr>`; }).join('');
}

function update() {
  const v = readValues();
  const validationErrors = validate(v);
  showErrors(validationErrors);
  saveCurrent(v);
  if (validationErrors.length) return false;
  const r = calculate(v);
  setText('availableNights', number(r.available)); setText('soldNights', number(r.sold)); setText('averageOccupiedRooms', number(r.avgOccupied)); setText('grossRevenue', money(r.gross));
  setText('simAutonomousNet', money(r.autNet)); setText('simAutonomousAnnual', money(r.autAnnual)); setText('simAgencyNet', money(r.agencyNet)); setText('simAgencyAnnual', money(r.agencyAnnual));
  setText('autGross', money(r.gross)); setText('autOtaCost', money(r.otaCost)); setText('autResidual', percent(r.autResidual*100)); setText('autNet', money(r.autNet)); setText('autAnnual', money(r.autAnnual));
  setText('agencyGross', money(r.gross)); setText('agencyOtaCost', money(r.otaCost)); setText('agencyCost', money(r.agencyCost)); setText('agencyTotalCost', money(r.otaCost+r.agencyCost)); setText('agencyResidual', percent(r.agencyResidual*100)); setText('agencyNet', money(r.agencyNet)); setText('agencyAnnual', money(r.agencyAnnual));
  setText('breakEvenAutNet', money(r.autNet)); setText('breakEvenAgencyGross', money(r.breakEvenGross)); setText('breakEvenIncreaseEuro', money(r.breakEvenEuro)); setText('breakEvenIncreasePercent', percent(r.breakEvenPct));
  setText('higherTargetNet', money(r.targetNet)); setText('higherAgencyGross', money(r.higherGross)); setText('higherIncreaseEuro', money(r.higherEuro)); setText('higherIncreasePercent', percent(r.higherPct));
  setText('goalNetAut', money(v.minimumNet)); setText('goalGrossAut', money(r.goalGrossAut)); setText('goalNetAgency', money(v.minimumNet)); setText('goalGrossAgency', money(r.goalGrossAgency));
  const delta = r.agencyNet - v.minimumNet;
  const status = $('goalStatus');
  status.className = 'status ' + (delta >= 0 ? 'good' : delta >= -v.minimumNet * .1 ? 'warning' : 'bad');
  status.textContent = delta >= 0 ? `Obiettivo raggiunto: superato di ${money(delta)}.` : `Obiettivo non raggiunto: mancano ${money(-delta)}.`;
  updateTables(v);
  return true;
}

let updateTimer;
function scheduleUpdate() { clearTimeout(updateTimer); updateTimer = setTimeout(update, 120); }
function apply(v) { numericIds.forEach(id => $(id).value = String(v[id] ?? DEFAULTS[id]).replace('.', ',')); checkIds.forEach(id => $(id).checked = Boolean(v[id])); $('language').value = v.language || 'it'; update(); }
function load() { try { apply({...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')}); } catch { apply(DEFAULTS); } }
function reset() { localStorage.removeItem(STORAGE_KEY); apply(DEFAULTS); $('generatedMessage').value=''; $('scenarioName').value=''; }
function scenarios() { try { return JSON.parse(localStorage.getItem(SCENARIOS_KEY) || '[]'); } catch { return []; } }
function storeScenarios(list) { localStorage.setItem(SCENARIOS_KEY, JSON.stringify(list)); }
function escapeHtml(s) { return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function renderScenarios() { const list=scenarios(), root=$('scenarioList'); if(!list.length){root.innerHTML='<div class="hint">Nessuno scenario salvato.</div>';return;} root.innerHTML=''; list.forEach(s=>{const el=document.createElement('div');el.className='scenario-item';el.innerHTML=`<div><strong>${escapeHtml(s.name)}</strong><div class="meta">${new Date(s.createdAt).toLocaleString('it-IT')}</div></div><div class="scenario-actions"><button class="btn-secondary">Carica</button><button class="btn-danger">Elimina</button></div>`;const [a,b]=el.querySelectorAll('button');a.onclick=()=>apply({...DEFAULTS,...s.values});b.onclick=()=>{storeScenarios(list.filter(x=>x.id!==s.id));renderScenarios();};root.appendChild(el);}); }
function saveScenario(){const name=$('scenarioName').value.trim(),v=readValues(),e=validate(v);if(!name)e.push('Inserisci un nome per lo scenario.');showErrors(e);if(e.length)return;const list=scenarios();list.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name,createdAt:new Date().toISOString(),values:v});storeScenarios(list);$('scenarioName').value='';renderScenarios();}
function italian(v,r){return `Simulazione con ${number(v.rooms)} camere, occupazione del ${percent(v.occupancy)} e prezzo medio di ${money(v.averagePrice)}.\n\nFatturato lordo mensile: ${money(r.gross)}.\nNetto gestione autonoma: ${money(r.autNet)}.\nNetto gestione tramite agenzia: ${money(r.agencyNet)}.\n\nPer pareggiare la gestione autonoma, l'agenzia dovrebbe produrre ${money(r.breakEvenGross)} di lordo. Per ottenere un netto superiore del ${percent(v.desiredIncrease)}, dovrebbe produrre ${money(r.higherGross)}.`;}
function bangla(v,r){return `মাসিক মোট আয়: ${money(r.gross)}।\nনিজে পরিচালনায় নেট আয়: ${money(r.autNet)}।\nএজেন্সির মাধ্যমে নেট আয়: ${money(r.agencyNet)}।\nসমান নেট আয়ের জন্য এজেন্সির মোট আয় দরকার ${money(r.breakEvenGross)}।`;}
function generate(){const v=readValues(),e=validate(v);showErrors(e);if(e.length)return;const r=calculate(v);$('generatedMessage').value=v.language==='bn'?bangla(v,r):italian(v,r);}
async function copy(){if(!$('generatedMessage').value.trim())generate();const text=$('generatedMessage').value;if(!text)return;try{await navigator.clipboard.writeText(text);}catch{$('generatedMessage').select();document.execCommand('copy');}const c=$('copyConfirmation');c.style.display='inline';setTimeout(()=>c.style.display='none',1600);}

function addCalculateButton(){const toolbar=document.querySelector('.toolbar');if(!toolbar||$('calculateBtn'))return;const button=document.createElement('button');button.id='calculateBtn';button.type='button';button.className='btn-primary';button.textContent='Calcola ora';button.addEventListener('click',update);toolbar.prepend(button);}

function installUxEnhancements(){
  const style=document.createElement('style');
  style.textContent=`
    .change-toast{position:sticky;top:8px;z-index:50;display:none;margin:0 0 16px;padding:13px 15px;border-radius:13px;background:#172a22;color:#fff;box-shadow:0 10px 26px rgba(0,0,0,.18);font-size:.92rem}
    .change-toast.show{display:block;animation:toastIn .18s ease-out}.change-toast strong{display:block;margin-bottom:3px}.change-toast small{color:#d5e7de}
    .result-explanation{margin:-8px 0 16px;color:#5c6963;font-size:.9rem;line-height:1.5}
    .updated-flash{animation:updatedFlash 1.2s ease-out}
    details.advanced-block{margin-bottom:20px;background:#fff;border:1px solid #dce4df;border-radius:16px;box-shadow:0 6px 18px rgba(24,33,29,.04)}
    details.advanced-block>summary{cursor:pointer;padding:17px 20px;font-weight:800;list-style:none}details.advanced-block>summary::-webkit-details-marker{display:none}details.advanced-block>summary::after{content:'＋';float:right}details.advanced-block[open]>summary::after{content:'−'}details.advanced-block>.section{margin:0;border:0;box-shadow:none;border-top:1px solid #e7ece9;border-radius:0 0 16px 16px}
    @keyframes toastIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}@keyframes updatedFlash{0%{box-shadow:0 0 0 0 rgba(31,111,80,.38)}45%{box-shadow:0 0 0 7px rgba(31,111,80,.13)}100%{box-shadow:0 0 0 0 transparent}}
  `;
  document.head.appendChild(style);

  const toast=document.createElement('div');toast.id='changeToast';toast.className='change-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
  const errorBox=$('errorBox');errorBox.parentNode.insertBefore(toast,errorBox.nextSibling);

  const explanations={
    'Riepilogo decisionale':'Sintesi pratica della convenienza: confronta i netti e indica quanto deve produrre l’agenzia per pareggiare.',
    'Occupazione necessaria per raggiungere l’obiettivo':'Mostra quante notti e quale percentuale di occupazione servono per ottenere il netto mensile desiderato.',
    'Simulatore camere':'Traduce camere, giorni, prezzo e occupazione in notti vendute, fatturato e netto stimato.',
    'Confronto dettagliato':'Scompone il lordo nelle singole commissioni e mostra quanto rimane nelle due modalità.',
    'Pareggio e guadagno superiore':'Calcola quanto lordo aggiuntivo deve generare l’agenzia per pareggiare o superare la gestione autonoma.',
    'Obiettivo netto minimo':'Indica il fatturato lordo necessario per raggiungere l’obiettivo netto impostato.',
    'Tabella scenari lordi':'Confronto rapido dei netti ottenibili con diversi livelli di fatturato.',
    'Tabella pareggio agenzia':'Mostra, per ogni lordo autonomo, quanto dovrebbe produrre l’agenzia per lasciare lo stesso netto.'
  };
  document.querySelectorAll('section.section').forEach(section=>{const h=section.querySelector(':scope > h2');if(!h||!explanations[h.textContent.trim()])return;const p=document.createElement('p');p.className='result-explanation';p.textContent=explanations[h.textContent.trim()];h.insertAdjacentElement('afterend',p);});

  ['Tabella scenari lordi','Tabella pareggio agenzia','Scenari salvati','Generatore di messaggio'].forEach(title=>{
    const section=[...document.querySelectorAll('section.section')].find(s=>s.querySelector(':scope > h2')?.textContent.trim()===title);
    if(!section)return;const details=document.createElement('details');details.className='advanced-block';const summary=document.createElement('summary');summary.textContent=title;section.querySelector('h2')?.remove();details.append(summary);section.parentNode.insertBefore(details,section);details.append(section);
  });
}

function notifyFieldChange(id){
  const meta=fieldMeta[id];if(!meta)return;
  const toast=$('changeToast');
  toast.innerHTML=`<strong>Aggiornato: ${meta.label}</strong><small>Risultati interessati: ${meta.sections.join(' · ')}</small>`;
  toast.classList.remove('show');void toast.offsetWidth;toast.classList.add('show');
  clearTimeout(notifyFieldChange.timer);notifyFieldChange.timer=setTimeout(()=>toast.classList.remove('show'),3200);
  const sectionNames=new Set(meta.sections);
  document.querySelectorAll('section.section').forEach(section=>{const title=section.querySelector(':scope > h2')?.textContent.trim();if(title&&[...sectionNames].some(name=>title.includes(name)||name.includes(title))){section.classList.remove('updated-flash');void section.offsetWidth;section.classList.add('updated-flash');}});
}

function bindEvents(){
  numericIds.forEach(id=>{const el=$(id);['input','change','blur'].forEach(evt=>el.addEventListener(evt,scheduleUpdate));el.addEventListener('change',()=>notifyFieldChange(id));el.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();update();notifyFieldChange(id);el.blur();}});});
  checkIds.forEach(id=>$(id).addEventListener('change',()=>{update();notifyFieldChange(id);}));
  $('language').addEventListener('change',()=>{update();if($('generatedMessage').value)generate();});
  $('resetBtn').addEventListener('click',reset);$('saveScenarioBtn').addEventListener('click',saveScenario);$('generateMessageBtn').addEventListener('click',generate);$('copyMessageBtn').addEventListener('click',copy);$('scrollMessageBtn').addEventListener('click',()=>$('messageSection').scrollIntoView({behavior:'smooth'}));
}

addCalculateButton();installUxEnhancements();bindEvents();load();renderScenarios();

const test=calculate(DEFAULTS);console.assert(test.available===150&&Math.abs(test.gross-6300)<.01&&Math.abs(test.autNet-4819.5)<.01&&Math.abs(test.agencyNet-3559.5)<.01,'Test iniziale fallito');
const increase10=calculate(DEFAULTS).higherGross;const increase20=calculate({...DEFAULTS,desiredIncrease:20}).higherGross;console.assert(increase20>increase10,'Test incremento netto desiderato fallito');