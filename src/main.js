// Google Sheet — paste the sheet ID from the URL of your workbook.
// Example URL: https://docs.google.com/spreadsheets/d/1AbC.../edit
// The sheet must be shared as "Anyone with the link can view".
const SHEET_ID = '1vDWoFJQASdsFVyQ3IDul9nj_F5frk1t9WmdxznJ5UK0';
const STATS_TAB = 'stats';
const CLIENTS_TAB = 'clients';

const FETCH_TIMEOUT_MS = 1200;

const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 10);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    if (href.length < 2) return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    const offset = nav.offsetHeight || 64;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
  });
});

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function csvToObjects(text) {
  const rows = parseCSV(text).filter(r => r.some(c => c && c.trim() !== ''));
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = (r[i] || '').trim());
    return obj;
  });
}

async function fetchSheet(tab) {
  if (!SHEET_ID) throw new Error('SHEET_ID not configured');
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  return csvToObjects(await res.text());
}

async function applyStats() {
  const rows = await fetchSheet(STATS_TAB);
  rows.forEach(row => {
    const id = row.id;
    if (!id) return;
    const stat = document.querySelector(`[data-stat-id="${id}"]`);
    if (!stat) return;
    if (row.value && !isNaN(parseInt(row.value, 10))) {
      stat.setAttribute('data-target', parseInt(row.value, 10));
    }
    if (row.label) {
      const label = stat.querySelector('[data-stat-label]');
      if (label) label.textContent = row.label;
    }
    if (row.suffix !== undefined) {
      const suffix = stat.querySelector('[data-stat-suffix]');
      if (suffix && row.suffix) suffix.textContent = row.suffix;
    }
  });
}

async function applyClients() {
  const rows = await fetchSheet(CLIENTS_TAB);
  const names = rows.map(r => r.name).filter(Boolean);
  if (names.length === 0) return;
  const list = document.getElementById('clients-list');
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);
  names.forEach(name => {
    const li = document.createElement('li');
    li.className = 'dotted-b pb-3';
    li.textContent = name;
    list.appendChild(li);
  });
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startCounters() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const wrap = e.target;
      const target = parseInt(wrap.getAttribute('data-target'), 10);
      const el = wrap.querySelector('[data-counter]');
      if (!el || isNaN(target)) { countIO.unobserve(wrap); return; }
      if (prefersReduced) { el.textContent = target.toLocaleString('fr-FR'); countIO.unobserve(wrap); return; }
      const dur = 1400;
      const start = performance.now();
      (function tick(now) {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.floor(eased * target).toLocaleString('fr-FR');
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = target.toLocaleString('fr-FR');
      })(performance.now());
      countIO.unobserve(wrap);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.stat').forEach(s => countIO.observe(s));
}

// Kick off sheet fetches in parallel. Counters wait on stats (or timeout) so
// the animation uses fresh values when possible, hardcoded fallback otherwise.
// Clients render independently — swaps in whenever it resolves.
applyClients().catch(err => console.warn('Clients fetch failed, using fallback:', err.message));

Promise.race([
  applyStats().catch(err => console.warn('Stats fetch failed, using fallback:', err.message)),
  timeout(FETCH_TIMEOUT_MS),
]).then(startCounters);
