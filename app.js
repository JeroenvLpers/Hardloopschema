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

// Korte trilling (als de telefoon dat ondersteunt)
function tril(patroon) {
  try { if (navigator.vibrate) navigator.vibrate(patroon); } catch (e) { /* negeren */ }
}

// '37:12', '1:02:05' of '45' (minuten) -> seconden
function naarSec(tijd) {
  const d = String(tijd).trim().split(':').map(Number);
  if (d.some(isNaN)) return 0;
  if (d.length === 1) return d[0] * 60;
  if (d.length === 2) return d[0] * 60 + d[1];
  if (d.length === 3) return d[0] * 3600 + d[1] * 60 + d[2];
  return 0;
}

// Gemiddeld tempo uit gelopen km en tijd, bijv. '6:02 /km' (leeg als het niet kan)
function tempo(g) {
  const k = parseFloat(String(g.km || '').replace(',', '.'));
  const s = naarSec(g.tijd || '');
  if (!(k > 0) || !(s > 0)) return '';
  const p = Math.round(s / k);
  return `${Math.floor(p / 60)}:${String(p % 60).padStart(2, '0')} /km`;
}

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
    rest === 0 ? '<strong>Het is zover!</strong> Succes vandaag 🏁' :
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
  const compleet = gedaan === items.length;
  $('weekDone').innerHTML = `${compleet ? `<span class="vink-ico">${VINK}</span>` : ''}${gedaan}/${items.length} voltooid`;
  $('weekDone').classList.toggle('compleet', compleet);
  $('weekDone').classList.remove('pop');
  $('prevWeek').disabled = week === 0;
  $('nextWeek').disabled = week === n - 1;
  $('thisWeek').hidden = week === huidigeWeek();

  $('cards').innerHTML = items.map((x) => kaart(x, eerste)).join('');
}

/* ---------- Komoot-route bij een training ---------- */

const plek = () => staat.plek || schema.standaardPlek || '';

// Routes voor de gekozen plek (hoofdletters maken niet uit)
function routesVoor(naam) {
  const sleutel = Object.keys(schema.routes || {}).find((k) => k.toLowerCase() === naam.trim().toLowerCase());
  return sleutel ? schema.routes[sleutel] : [];
}

function routeBlok(t) {
  if (t.soort === 'wedstrijd') return '';
  const p = plek();
  if (!p) return '';
  const routes = routesVoor(p);

  // Geen routes bekend voor deze plek: zoeklink naar Komoot-routes in de buurt
  if (!routes.length) {
    const zoek = 'https://duckduckgo.com/?q=' + encodeURIComponent(`komoot hardlopen rond ${p} ${Math.round(t.km)} km`);
    return `<a class="route" href="${zoek}" target="_blank" rel="noopener">
      <span class="route-ico" aria-hidden="true">🗺️</span>
      <span class="route-tekst"><span class="route-naam">Zoek een Komoot-route rond ${esc(p)}</span>
      <span class="route-info">ongeveer ${km(t.km)}</span></span>
      <span class="route-pijl" aria-hidden="true">↗</span></a>`;
  }

  // De route waarvan de afstand het dichtst bij de training ligt
  const r = routes.reduce((a, b) => (Math.abs(b.km - t.km) < Math.abs(a.km - t.km) ? b : a));
  const verschil = Math.round((r.km - t.km) * 10) / 10;
  const uitleg = Math.abs(verschil) < 0.5 ? 'past precies'
    : verschil > 0 ? `${km(verschil)} langer dan je training`
    : `${km(-verschil)} korter dan je training`;
  return `<a class="route" href="${esc(r.url)}" target="_blank" rel="noopener">
    <span class="route-ico" aria-hidden="true">🗺️</span>
    <span class="route-tekst"><span class="route-naam">${esc(r.naam)}</span>
    <span class="route-info">Komoot · ${km(r.km)} · ${uitleg}</span></span>
    <span class="route-pijl" aria-hidden="true">↗</span></a>`;
}

const kmRegel = (t, g) => km(t.km) + (tempo(g) ? ' · tempo ' + tempo(g) : '');
const tempoRegel = (g) => (tempo(g) ? `Gemiddeld tempo: <strong>${tempo(g)}</strong>` : '');

function kaart({ id, t, dag, standaard, datum }, eerste) {
  const klaar = !!staat.klaar[id];
  const isVandaag = datum === vandaag;
  const gemist = !klaar && datum < vandaag;
  const raceVandaag = isVandaag && t.soort === 'wedstrijd';
  const isOpen = open.has(id);
  const g = staat.gelopen[id] || {};

  const stappen = t.stappen.map((s) => `
    <li>
      <div class="step-main"><span class="step-title">${esc(s.titel)}</span><span class="step-detail">${esc(s.detail || '')}</span></div>
      ${schema.rustigTempo && /rustig/i.test(s.detail || '') ? `<span class="step-noot">${esc(schema.rustigTempo)}</span>` : ''}
      ${s.rust ? `<span class="step-rust">${esc(s.rust)}</span>` : ''}
    </li>`).join('');

  const opties = DAGEN.map((_, i) => `<option value="${i + 1}"${i + 1 === dag ? ' selected' : ''}>${kort(eerste + i)}${i + 1 === standaard ? ' (standaard)' : ''}</option>`).join('');

  return `
  <article class="card soort-${esc(t.soort)}${klaar ? ' done' : ''}${isVandaag ? ' today' : ''}${raceVandaag ? ' race-vandaag' : ''}" data-id="${id}">
    <div class="card-head">
      <button class="card-toggle" aria-expanded="${isOpen}">
        <span class="date">${isVandaag ? '<span class="badge">Vandaag</span>' : ''}<span class="date-text">${kort(datum)}</span>${gemist ? '<span class="gemist" role="img" aria-label="gemist"></span>' : ''}${dag !== standaard ? '<span class="moved">verplaatst</span>' : ''}</span>
        <span class="title">${esc(raceVandaag ? schema.wedstrijd.naam : t.titel)}</span>
        <span class="km">${kmRegel(t, g)}</span>
      </button>
      <button class="check" aria-pressed="${klaar}" aria-label="${klaar ? 'Afvinken ongedaan maken' : 'Afvinken'}">${VINK}</button>
    </div>
    <div class="card-body"${isOpen ? '' : ' hidden'}>
      <ol class="steps">${stappen}</ol>
      ${routeBlok(t)}
      <div class="fields">
        <label>Gelopen km<input data-veld="km" inputmode="decimal" placeholder="${t.km.toLocaleString('nl-NL')}" value="${esc(g.km || '')}"></label>
        <label>Tijd<input data-veld="tijd" placeholder="u:mm:ss" value="${esc(g.tijd || '')}"></label>
      </div>
      <p class="tempo-regel">${tempoRegel(g)}</p>
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
    if (!staat.klaar[id]) return;

    const isRace = trainingenVan(week).find((x) => x.id === id).t.soort === 'wedstrijd';
    const weekKlaar = $('weekDone').classList.contains('compleet');
    if (isRace) finish();
    else if (weekKlaar) { tril([20, 80, 40]); vier(); }
    else tril(25);
  } else if (e.target.closest('.card-toggle')) {
    if (open.has(id)) open.delete(id);
    else open.add(id);
    tekenWeek();
  }
});

// Kleine viering als alle trainingen van de week klaar zijn
function vier() {
  const el = $('weekDone');
  el.classList.remove('pop');
  void el.offsetWidth; // animatie opnieuw laten starten
  el.classList.add('pop');

  const kleuren = ['--done', '--rustig', '--interval', '--tempo', '--lang'];
  const burst = document.createElement('span');
  burst.className = 'burst';
  burst.innerHTML = '<i class="ring"></i>' + Array.from({ length: 10 }, (_, i) =>
    `<i class="deeltje" style="--hoek:${i * 36}deg;--kleur:var(${kleuren[i % 5]})"></i>`).join('');
  el.querySelector('.vink-ico').append(burst);
  setTimeout(() => burst.remove(), 800);
}

// Feestelijk finishscherm als je de wedstrijd afvinkt
function finish() {
  const w = schema.wedstrijd;
  const raceId = trainingenVan(schema.weken.length - 1).find((x) => x.t.soort === 'wedstrijd').id;
  const g = staat.gelopen[raceId] || {};
  const totaal = schema.weken.reduce((n, wk) => n + wk.trainingen.length, 0);
  const gedaan = schema.weken.reduce((n, wk, i) =>
    n + wk.trainingen.filter((_, j) => staat.klaar[`w${i + 1}-${j + 1}`]).length, 0);
  const kleuren = ['--done', '--rustig', '--interval', '--tempo', '--lang', '--text'];

  const scherm = document.createElement('div');
  scherm.className = 'finish-scherm';
  scherm.innerHTML = `
    <div class="confetti">${Array.from({ length: 40 }, (_, i) =>
      `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 0.9).toFixed(2)}s;--r:${Math.floor(Math.random() * 360)}deg;--kleur:var(${kleuren[i % kleuren.length]})"></i>`).join('')}</div>
    <div class="finish-kaart" role="dialog" aria-label="Gefinisht">
      <div class="medaille">🏅</div>
      <h2>Gefinisht!</h2>
      <p>${esc(w.naam)} · ${esc(w.afstand)}</p>
      ${g.tijd ? `<p class="finish-tijd">${esc(g.tijd)}${tempo(g) ? ' · ' + tempo(g) : ''}</p>` : ''}
      <p class="sub">${gedaan} van ${totaal} trainingen voltooid</p>
      <button class="btn">Sluiten</button>
    </div>`;
  scherm.onclick = () => scherm.remove();
  document.body.append(scherm);
  tril([40, 80, 40, 80, 120]);
}

// Gelopen km / tijd: direct bewaren tijdens het typen
$('cards').addEventListener('input', (e) => {
  const veld = e.target.dataset.veld;
  if (!veld) return;
  const card = e.target.closest('.card');
  const id = card.dataset.id;
  const g = { ...staat.gelopen[id], [veld]: e.target.value.trim() };
  if (!g.km && !g.tijd) delete staat.gelopen[id];
  else staat.gelopen[id] = g;
  bewaar();

  // Tempo direct bijwerken, zonder de kaart opnieuw te tekenen (dan blijft je cursor staan)
  const t = trainingenVan(week).find((x) => x.id === id).t;
  card.querySelector('.km').textContent = kmRegel(t, g);
  card.querySelector('.tempo-regel').innerHTML = tempoRegel(g);
});

/* ---------- Overzicht van alle weken ---------- */

const wekenDialog = $('weken');

function tekenWeken() {
  const nu = huidigeWeek();
  $('wekenLijst').innerHTML = schema.weken.map((wk, i) => {
    const eerste = start + i * 7;
    const items = trainingenVan(i);
    const gedaan = items.filter((x) => staat.klaar[x.id]).length;
    const stippen = items.map((x) => {
      const soort = staat.klaar[x.id] ? 'klaar' : x.datum < vandaag ? 'gemist' : 'open';
      return `<i class="stip ${soort}"></i>`;
    }).join('');
    return `
      <li><button class="week-rij${i === nu ? ' nu' : ''}${i === week ? ' gekozen' : ''}" data-week="${i}">
        <span class="wr-tekst">
          <span class="wr-titel">Week ${i + 1}${i === nu ? ' <span class="badge">Nu</span>' : ''}</span>
          <span class="sub">${kort(eerste, false)} – ${kort(eerste + 6, false)}${wk.label ? ' · ' + esc(wk.label) : ''}</span>
        </span>
        <span class="wr-stippen" aria-label="${gedaan} van ${items.length} voltooid">${stippen}</span>
      </button></li>`;
  }).join('');
}

$('weekBtn').onclick = () => {
  tekenWeken();
  wekenDialog.showModal();
  const gekozen = wekenDialog.querySelector('.gekozen');
  if (gekozen) gekozen.scrollIntoView({ block: 'center' });
};
$('closeWeken').onclick = () => wekenDialog.close();
wekenDialog.addEventListener('click', (e) => {
  if (e.target === wekenDialog) return wekenDialog.close();
  const rij = e.target.closest('.week-rij');
  if (!rij) return;
  week = Number(rij.dataset.week);
  wekenDialog.close();
  tekenWeek();
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
  $('plek').value = plek();
  $('plekken').innerHTML = Object.keys(schema.routes || {}).map((k) => `<option value="${esc(k)}">`).join('');
  menu.showModal();
};

$('savePlek').onclick = () => {
  const p = $('plek').value.trim();
  staat.plek = !p || p === schema.standaardPlek ? null : p;
  bewaar();
  menu.close();
  teken();
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
