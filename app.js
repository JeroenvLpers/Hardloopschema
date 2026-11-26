'use strict';

/*
 * Hardloopschema – alle logica.
 * Het schema zelf staat in schema.json. Wat jij in de app doet (vinkjes,
 * gelopen km/tijd, verplaatsingen, gekozen dagen) wordt op je telefoon
 * bewaard onder de sleutel hieronder.
 */
const OPSLAG = 'hardloopschema-v1';
const DAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const VINK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const $ = (id) => document.getElementById(id);

/* ---------- Datums: hele dagen, tijdzone Europe/Amsterdam ---------- */

// Vandaag als 'JJJJ-MM-DD' in Nederlandse tijd.
// Voor testen kun je ?datum=2026-12-03 achter het adres zetten.
function vandaagISO() {
  const test = new URLSearchParams(location.search).get('datum');
  if (test && /^\d{4}-\d{2}-\d{2}$/.test(test)) return test;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// 'JJJJ-MM-DD' -> dagnummer (aantal dagen sinds 1970), zodat rekenen simpel is.
function dagNr(iso) {
  const [j, m, d] = iso.split('-').map(Number);
  return Date.UTC(j, m - 1, d) / 864e5;
}

// dagnummer -> 'di 1 dec' (of '1 dec' zonder weekdag)
function kort(nr, metWeekdag = true) {
  const d = new Date(nr * 864e5);
  const weekdag = (d.getUTCDay() + 6) % 7; // maandag = 0
  return `${metWeekdag ? DAGEN[weekdag] + ' ' : ''}${d.getUTCDate()} ${MAANDEN[d.getUTCMonth()]}`;
}

const jaar = (nr) => new Date(nr * 864e5).getUTCFullYear();
const km = (n) => n.toLocaleString('nl-NL') + ' km';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const klem = (n, min, max) => Math.min(max, Math.max(min, n));

/* ---------- Opslag op de telefoon ---------- */

function laad() {
  const leeg = { klaar: {}, gelopen: {}, verplaatst: {}, dagen: null };
  try {
    const s = JSON.parse(localStorage.getItem(OPSLAG));
    if (s) return { ...leeg, ...s };
  } catch (e) { /* niets opgeslagen of geen toegang */ }
  return leeg;
}

function bewaar() {
  try { localStorage.setItem(OPSLAG, JSON.stringify(staat)); } catch (e) { /* negeren */ }
}

/* ---------- Toestand ---------- */

let schema, start, race, vandaag;
let week = 0;                 // getoonde week (0 = week 1)
const open = new Set();       // uitgeklapte trainingen
const staat = laad();

const gekozenDagen = () => (staat.dagen || schema.standaardDagen).slice().sort((a, b) => a - b);

function huidigeWeek() {
  return klem(Math.floor((vandaag - start) / 7), 0, schema.weken.length - 1);
}

// Alle trainingen van een week, met hun dag (1 = ma ... 7 = zo) en datum.
function trainingenVan(w) {
  const dagen = gekozenDagen();
  return schema.weken[w].trainingen.map((t, i) => {
    const id = `w${w + 1}-${i + 1}`;
    const standaard = t.vasteDag || dagen[i] || dagen[dagen.length - 1];
    const dag = t.vasteDag || staat.verplaatst[id] || standaard;
    return { id, t, dag, standaard, datum: start + w * 7 + dag - 1 };
  }).sort((a, b) => a.dag - b.dag);
}

/* ---------- Tekenen ---------- */

function tekenKop() {
  const w = schema.wedstrijd;
  $('raceName').textContent = w.naam;
  $('raceMeta').textContent = `${kort(race)} ${jaar(race)} · ${w.afstand}`;

  const totaal = race - start;
  const pct = (klem(vandaag - start, 0, totaal) / totaal) * 100;
  $('trackFill').style.width = pct + '%';
  $('trackRunner').style.left = pct + '%';

  const rest = race - vandaag;
  $('daysLeft').innerHTML =
    rest > 1 ? `nog <strong>${rest}</strong> dagen` :
    rest === 1 ? 'nog <strong>1</strong> dag' :
    rest === 0 ? '<strong>Vandaag!</strong> Succes 🏁' :
    '<strong>Gefinisht</strong> 🏁';
  $('startLabel').textContent = 'start ' + kort(start, false);
  $('endLabel').textContent = kort(race, false);
}

function tekenWeek() {
  const n = schema.weken.length;
  const eerste = start + week * 7;
  const label = schema.weken[week].label;
  const items = trainingenVan(week);
  const gedaan = items.filter((x) => staat.klaar[x.id]).length;

  $('weekTitle').textContent = `Week ${week + 1} van ${n}`;
  $('weekMeta').textContent = `${kort(eerste, false)} – ${kort(eerste + 6, false)}${label ? ' · ' + label : ''}`;
  $('weekDone').textContent = `${gedaan}/${items.length} voltooid`;
  $('prevWeek').disabled = week === 0;
  $('nextWeek').disabled = week === n - 1;
  $('thisWeek').hidden = week === huidigeWeek();

  $('cards').innerHTML = items.map((x) => kaart(x, eerste)).join('');
}

function kaart({ id, t, dag, standaard, datum }, eerste) {
  const klaar = !!staat.klaar[id];
  const isVandaag = datum === vandaag;
  const isOpen = open.has(id);
  const g = staat.gelopen[id] || {};

  const stappen = t.stappen.map((s) => `
    <li>
      <div class="step-main"><span class="step-title">${esc(s.titel)}</span><span class="step-detail">${esc(s.detail || '')}</span></div>
      ${s.rust ? `<span class="step-rust">${esc(s.rust)}</span>` : ''}
    </li>`).join('');

  const opties = DAGEN.map((_, i) => `<option value="${i + 1}"${i + 1 === dag ? ' selected' : ''}>${kort(eerste + i)}${i + 1 === standaard ? ' (standaard)' : ''}</option>`).join('');

  return `
  <article class="card soort-${esc(t.soort)}${klaar ? ' done' : ''}${isVandaag ? ' today' : ''}" data-id="${id}">
    <div class="card-head">
      <button class="card-toggle" aria-expanded="${isOpen}">
        <span class="date">${isVandaag ? '<span class="badge">Vandaag</span>' : ''}<span class="date-text">${kort(datum)}</span>${dag !== standaard ? '<span class="moved">verplaatst</span>' : ''}</span>
        <span class="title">${esc(t.titel)}</span>
        <span class="km">${km(t.km)}</span>
      </button>
      <button class="check" aria-pressed="${klaar}" aria-label="${klaar ? 'Afvinken ongedaan maken' : 'Afvinken'}">${VINK}</button>
    </div>
    <div class="card-body"${isOpen ? '' : ' hidden'}>
      <ol class="steps">${stappen}</ol>
      <div class="fields">
        <label>Gelopen km<input data-veld="km" inputmode="decimal" placeholder="${t.km.toLocaleString('nl-NL')}" value="${esc(g.km || '')}"></label>
        <label>Tijd<input data-veld="tijd" placeholder="u:mm:ss" value="${esc(g.tijd || '')}"></label>
      </div>
      ${t.vasteDag ? '' : `<label class="move">Verplaats naar<select data-standaard="${standaard}">${opties}</select></label>`}
    </div>
  </article>`;
}

function teken() {
  tekenKop();
  tekenWeek();
}

/* ---------- Bediening ---------- */

$('prevWeek').onclick = () => { week = klem(week - 1, 0, schema.weken.length - 1); tekenWeek(); };
$('nextWeek').onclick = () => { week = klem(week + 1, 0, schema.weken.length - 1); tekenWeek(); };
$('thisWeek').onclick = () => { week = huidigeWeek(); tekenWeek(); };

$('cards').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;

  if (e.target.closest('.check')) {
    if (staat.klaar[id]) delete staat.klaar[id];
    else staat.klaar[id] = true;
    bewaar();
    tekenWeek();
  } else if (e.target.closest('.card-toggle')) {
    if (open.has(id)) open.delete(id);
    else open.add(id);
    tekenWeek();
  }
});

// Gelopen km / tijd: direct bewaren tijdens het typen
$('cards').addEventListener('input', (e) => {
  const veld = e.target.dataset.veld;
  if (!veld) return;
  const id = e.target.closest('.card').dataset.id;
  const g = { ...staat.gelopen[id], [veld]: e.target.value.trim() };
  if (!g.km && !g.tijd) delete staat.gelopen[id];
  else staat.gelopen[id] = g;
  bewaar();
});

// Verplaatsen binnen de week
$('cards').addEventListener('change', (e) => {
  if (e.target.tagName !== 'SELECT') return;
  const id = e.target.closest('.card').dataset.id;
  const dag = Number(e.target.value);
  if (dag === Number(e.target.dataset.standaard)) delete staat.verplaatst[id];
  else staat.verplaatst[id] = dag;
  bewaar();
  tekenWeek();
});

/* ---------- Menu ---------- */

const menu = $('menu');
let keuze = new Set();

function tekenDagkeuze() {
  $('dayPick').innerHTML = DAGEN.map((d, i) =>
    `<button type="button" data-dag="${i + 1}" aria-pressed="${keuze.has(i + 1)}">${d}</button>`).join('');
  $('saveDays').disabled = keuze.size !== 3;
  $('saveDays').textContent = keuze.size === 3 ? 'Opslaan' : keuze.size < 3 ? `Kies nog ${3 - keuze.size}` : 'Kies er precies 3';
}

$('menuBtn').onclick = () => {
  keuze = new Set(gekozenDagen());
  tekenDagkeuze();
  menu.showModal();
};
$('closeMenu').onclick = () => menu.close();
menu.addEventListener('click', (e) => { if (e.target === menu) menu.close(); });

$('dayPick').addEventListener('click', (e) => {
  const knop = e.target.closest('button');
  if (!knop) return;
  const dag = Number(knop.dataset.dag);
  if (keuze.has(dag)) keuze.delete(dag);
  else keuze.add(dag);
  tekenDagkeuze();
});

$('saveDays').onclick = () => {
  const dagen = [...keuze].sort((a, b) => a - b);
  staat.dagen = dagen.join() === schema.standaardDagen.join() ? null : dagen;
  bewaar();
  menu.close();
  teken();
};

$('resetBtn').onclick = () => {
  if (!confirm('Alle vinkjes en ingevulde km/tijden wissen?\nDit kun je niet ongedaan maken.')) return;
  staat.klaar = {};
  staat.gelopen = {};
  bewaar();
  menu.close();
  teken();
};

/* ---------- Opstarten ---------- */

function zetVandaag() {
  vandaag = dagNr(vandaagISO());
  week = huidigeWeek();
  trainingenVan(week).forEach((x) => { if (x.datum === vandaag) open.add(x.id); });
}

fetch('schema.json')
  .then((r) => r.json())
  .then((s) => {
    schema = s;
    start = dagNr(s.start);
    start -= (new Date(start * 864e5).getUTCDay() + 6) % 7; // altijd op maandag beginnen
    race = dagNr(s.wedstrijd.datum);
    zetVandaag();
    teken();

    // Als de app openstaat en het wordt een nieuwe dag: bijwerken.
    let laatst = vandaagISO();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || vandaagISO() === laatst) return;
      laatst = vandaagISO();
      zetVandaag();
      teken();
    });
  })
  .catch(() => {
    $('cards').innerHTML = '<p class="error">Het schema kon niet geladen worden. Controleer schema.json.</p>';
  });

// Offline werken + vragen of de opslag bewaard mag blijven
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
