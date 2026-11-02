import {
  S, setState, save, saveNow, getMeta, loadPlain, unlock, setPin, checkPin, lockNow, wipeAll,
  CURRENCIES, CUR_SYM, uid, toBase, convert, fmt, fmtNum, refreshRates, cat, catName, acc, sortTx, txBase,
  DAY, startOf, addUnit, fmtDate, isoDate, kvSet,
} from './store.js';
import { categorize, merchantKey, GOAL_EMOJI, CAT_EMOJI } from './cats.js';
import { t } from './i18n.js';
import { spend, income, byCat, series, detectSubs, limitStatus, goalPlan, goalSaved, buildInsights, splitNWS, avgMonthlySpend } from './insights.js';
import { columnChart } from './charts.js';
import * as Imp from './importer.js';
import * as Mono from './mono.js';
import { loadDemo, clearDemo } from './demo.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const I = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
  chart: '<path d="M3 21h18"/><path d="M6 17v-5M11 17V6M16 17v-8M21 17v-3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
  more: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="M14 7l-5 5 5 5"/><path d="M20 12H9"/>',
};
const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;

const ui = {
  tab: 'home',
  period: 'month',
  kind: 'exp',
  anchor: Date.now(),
  chartEnd: Date.now(),
  plans: 'goals',
  q: '',
  ftype: 'all',
  facc: '',
  fcat: '',
  limit: 80,
  allInsights: false,
};
let F = {}; // state of the currently open form

/* ================= boot ================= */
async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
  const meta = await getMeta();
  applyTheme(meta.theme || 'auto');
  if (meta.lang) S.lang = meta.lang;
  if (meta.pin) return showLock();
  const data = await loadPlain();
  if (data) setState(data);
  start();
}

function start() {
  applyTheme(S.theme);
  document.documentElement.lang = S.lang;
  if (!S.onboarded) return renderOnboarding();
  render();
  refreshRates().then((ch) => ch && render());
  if (S.mono?.token && S.accounts.some((a) => a.type === 'mono' && a.sync !== false && Date.now() - (a.lastSync || 0) > 30 * 60e3)) Mono.syncAll();
}

function applyTheme(th) {
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
  const dark = th === 'dark' || (th !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]')?.setAttribute('content', dark ? '#121413' : '#f5f4f0');
}

/* auto-lock */
let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    saveNow();
  } else if (hiddenAt) {
    const meta = await getMeta();
    if (meta.pin && $('#app').dataset.view === 'main' && Date.now() - hiddenAt > (S.settings.autoLockMin || 1) * 60e3) {
      await saveNow();
      lockNow();
      S.lang = meta.lang || S.lang;
      showLock();
    }
  }
});

Mono.onChange(() => {
  const chip = $('#syncChip');
  if (chip) chip.outerHTML = syncChip();
  const box = $('#monoProgress');
  if (box) box.innerHTML = monoProgress();
  if (!Mono.sync.running) {
    if (Mono.sync.added) toast(t('mono.added', { n: Mono.sync.added }));
    Mono.sync.added = 0;
    if (!$('#sheet-root').classList.contains('open')) render();
  } else if (Mono.sync.done && !$('#sheet-root').classList.contains('open')) renderMain();
});

/* ================= lock screen ================= */
let pinBuf = '';
function pinPad(title, sub = '') {
  return `<div class="lock">
    <div class="lock-logo">${logo()}</div>
    <h1>${esc(title)}</h1>
    <p class="muted" id="pinSub">${esc(sub)}</p>
    <div class="pin-dots" id="pinDots">${[0, 1, 2, 3].map(() => '<i></i>').join('')}</div>
    <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-action="pinKey" data-k="${n}">${n}</button>`).join('')}
      <span></span><button data-action="pinKey" data-k="0">0</button><button data-action="pinKey" data-k="del" aria-label="delete">⌫</button></div>
  </div>`;
}
let pinHandler = null;
function showLock() {
  $('#app').dataset.view = 'lock';
  closeSheet();
  $('#app').innerHTML = pinPad(t('lock.title'));
  pinBuf = '';
  pinHandler = async (pin) => {
    $('#pinSub').textContent = '…';
    if (await unlock(pin)) start();
    else pinError(t('lock.wrong'));
  };
}
function pinDots() {
  document.querySelectorAll('#pinDots i').forEach((el, i) => el.classList.toggle('on', i < pinBuf.length));
}
function pinError(msg) {
  pinBuf = '';
  pinDots();
  $('#pinSub').textContent = msg;
  const d = $('#pinDots');
  d.classList.remove('shake');
  void d.offsetWidth;
  d.classList.add('shake');
}

/* ================= onboarding ================= */
function renderOnboarding() {
  $('#app').dataset.view = 'onb';
  $('#app').innerHTML = `<div class="onb">
    <div class="onb-logo">${logo()}</div>
    <h1>${t('onb.title')}</h1>
    <p class="muted">${t('onb.sub')}</p>
    <div class="onb-block"><div class="label">${t('set.lang')}</div>${seg('setLang', [['ru', 'Русский'], ['en', 'English']], S.lang)}</div>
    <div class="onb-block"><div class="label">${t('onb.cur')}</div>${seg('setBase', CURRENCIES.map((c) => [c, `${CUR_SYM[c]} ${c}`]), S.base)}</div>
    <ul class="onb-list"><li>🏦 ${t('onb.p1')}</li><li>📊 ${t('onb.p2')}</li><li>🎯 ${t('onb.p3')}</li><li>💡 ${t('onb.p4')}</li><li>🔒 ${t('onb.p5')}</li></ul>
    <button class="btn primary big" data-action="onbStart">${t('onb.start')}</button>
    <button class="btn ghost big" data-action="onbDemo">${t('onb.demo')}</button>
  </div>`;
}

/* ================= main shell ================= */
const TABS = [['home', 'home'], ['tx', 'list'], ['stats', 'chart'], ['plans', 'target'], ['more', 'more']];

function render() {
  const app = $('#app');
  if (app.dataset.view !== 'main') {
    app.dataset.view = 'main';
    app.innerHTML = `<header class="top"><h1 id="title"></h1><div id="topRight"></div></header>
      <main id="main"></main>
      <button class="fab" data-action="addTx" aria-label="${t('tx.add')}">${icon('plus')}</button>
      <nav class="tabs" id="tabs"></nav>`;
  }
  $('#tabs').innerHTML = TABS.map(([id, ic]) => `<button data-action="tab" data-v="${id}" class="${ui.tab === id ? 'on' : ''}">${icon(ic)}<span>${t('tab.' + id)}</span></button>`).join('');
  $('.fab').style.display = ['home', 'tx', 'stats'].includes(ui.tab) ? '' : 'none';
  renderMain();
}

function renderMain() {
  const titles = { home: t('tab.homeTitle'), tx: t('tab.tx'), stats: t('tab.stats'), plans: t('tab.plans'), more: t('tab.more') };
  $('#title').textContent = titles[ui.tab];
  $('#topRight').innerHTML = syncChip();
  const fn = { home: renderHome, tx: renderTx, stats: renderStats, plans: renderPlans, more: renderMore }[ui.tab];
  $('#main').innerHTML = fn();
}

function syncChip() {
  if (!S.mono?.token) return '<span id="syncChip"></span>';
  const s = Mono.sync;
  if (s.running) {
    const wait = s.nextAt ? Math.max(0, Math.round((s.nextAt - Date.now()) / 1000)) : 0;
    return `<button id="syncChip" class="chip sync on" data-action="openMono">${icon('sync', 'spin')}${s.total > 1 ? `${s.done}/${s.total}` : ''}${wait ? ` · ${wait}${t('u.sec')}` : ''}</button>`;
  }
  const last = Math.max(0, ...S.accounts.filter((a) => a.type === 'mono').map((a) => a.lastSync || 0));
  return `<button id="syncChip" class="chip sync" data-action="syncNow" title="${t('mono.syncNow')}">${icon('sync')}${last ? ago(last) : ''}</button>`;
}
setInterval(() => {
  if (Mono.sync.running && Mono.sync.nextAt) {
    const chip = $('#syncChip');
    if (chip) chip.outerHTML = syncChip();
    const box = $('#monoProgress');
    if (box) box.innerHTML = monoProgress();
  }
}, 1000);

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60e3);
  if (m < 1) return t('ago.now');
  if (m < 60) return t('ago.min', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('ago.h', { n: h });
  return fmtDate(ts, { day: 'numeric', month: 'short' });
}

/* ================= helpers ================= */
const seg = (action, opts, cur, cls = '') =>
  `<div class="seg ${cls}">${opts.map(([v, l]) => `<button data-action="${action}" data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;

function accBalance(a) {
  if (a.balance == null || a.balance === '') return null;
  if (a.type === 'mono') return a.balance;
  let b = +a.balance;
  for (const x of S.tx) if (x.acc === a.id && x.src === 'manual' && x.date > (a.balanceTs || 0)) b += convert(x.amount, x.cur, a.cur);
  return b;
}
function totalBalance() {
  let s = 0, n = 0;
  for (const a of S.accounts) {
    if (a.include === false) continue;
    const b = accBalance(a);
    if (b == null) continue;
    s += toBase(b, a.cur);
    n++;
  }
  return n ? s : null;
}

function amountCls(x) {
  const k = cat(x.cat).kind;
  return k === 'inc' ? 'pos' : k === 'tr' ? 'muted' : x.amount > 0 ? 'pos' : '';
}
function txRow(x) {
  const c = cat(x.cat);
  const a = acc(x.acc);
  const sub = [catName(c), a?.name].filter(Boolean).join(' · ');
  const base = x.cur !== S.base ? `<small>${fmt(toBase(x.amount, x.cur), S.base, { sign: true })}</small>` : '';
  return `<button class="row tx" data-action="editTx" data-id="${x.id}">
    <span class="em">${c.emoji}</span>
    <span class="grow"><b>${esc(x.desc || catName(c))}</b><small>${esc(sub)}</small></span>
    <span class="amt ${amountCls(x)}">${fmt(x.amount, x.cur, { sign: true })}${base}</span></button>`;
}
function deltaBadge(cur, prev, upIsGood = false) {
  if (!prev || prev < 1) return '';
  const d = cur / prev - 1;
  if (Math.abs(d) < 0.01) return `<span class="delta flat">≈ 0%</span>`;
  const up = d > 0;
  const good = up === upIsGood;
  return `<span class="delta ${good ? 'good' : 'bad'}">${up ? '↑' : '↓'} ${Math.abs(Math.round(d * 100))}%</span>`;
}
function chartWidth() {
  return Math.min(window.innerWidth, 600) - 64;
}
function empty(emoji, title, text, actions = '') {
  return `<div class="card empty"><div class="em-big">${emoji}</div><h3>${title}</h3><p class="muted">${text}</p>${actions}</div>`;
}
function logo() {
  return `<svg viewBox="0 0 64 64" class="logo"><rect width="64" height="64" rx="18" fill="var(--accent)"/><path d="M18 40c4-10 10-15 14-15s6 4 10 4 5-3 6-5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><circle cx="18" cy="40" r="3.5" fill="#fff"/><circle cx="48" cy="24" r="3.5" fill="#fff"/></svg>`;
}

/* ================= HOME ================= */
function renderHome() {
  const now = Date.now();
  if (!S.tx.length) {
    return `${empty('👋', t('home.welcome'), t('home.welcomeText'), `<div class="stack">
      <button class="btn primary" data-action="openMono">🐱 ${t('home.connectMono')}</button>
      <button class="btn" data-action="openImport">📄 ${t('home.import')}</button>
      <button class="btn" data-action="addTx">✍️ ${t('home.manual')}</button>
      <button class="btn ghost" data-action="demoLoad">✨ ${t('home.demo')}</button></div>`)}`;
  }
  const m0 = +startOf(now, 'month');
  const pm = +addUnit(m0, 'month', -1);
  const el = now - m0;
  const exp = spend(m0, now + 1);
  const expPrev = spend(pm, pm + el);
  const inc = income(m0, now + 1);
  const bal = totalBalance();
  const noBal = S.accounts.filter((a) => a.include !== false && !a.demo && accBalance(a) == null);
  const month = fmtDate(now, { month: 'long' });

  let h = `<section class="hero card">
    <div class="label">${bal != null ? t('home.balance') : t('home.spentMonth', { m: month })}</div>
    <div class="hero-num">${bal != null ? fmt(bal) : fmt(exp)}</div>
    ${noBal.length ? `<button class="demo-note wide-note" data-action="accEdit" data-id="${noBal[0].id}">ℹ️ ${t('home.noBal', { a: esc(noBal.map((a) => a.name).join(', ')) })}</button>` : ''}
    ${S.demo ? `<div class="demo-note">✨ ${t('home.demoNote')} <button class="link" data-action="demoClear">${t('home.demoClear')}</button></div>` : ''}
  </section>
  <div class="tiles">
    <button class="tile" data-action="goStats" data-kind="exp"><div class="label">${t('home.expenses')} · ${month}</div><div class="val">${fmt(exp)}</div>${deltaBadge(exp, expPrev)}<small class="muted">${expPrev ? t('home.vsSame') : ''}</small></button>
    <button class="tile" data-action="goStats" data-kind="inc"><div class="label">${t('home.income')} · ${month}</div><div class="val">${fmt(inc)}</div><small class="muted">${inc ? t('home.left') + ': ' + fmt(inc - exp, S.base, { sign: true }) : '&nbsp;'}</small></button>
  </div>`;

  // last 7 days
  const days = series('day', 7, now);
  const avg = days.reduce((s, d) => s + d.value, 0) / 7;
  h += `<section class="card">
    <div class="card-head"><h3>${t('home.week')}</h3><span class="muted">${t('home.avgDay')}: ${fmt(avg)}</span></div>
    ${columnChart(days.map((d) => ({ label: fmtDate(d.start, { weekday: 'short' }), value: d.value, key: d.start, active: d.start === +startOf(now, 'day') })), { width: chartWidth(), height: 150, action: 'pickDay', avg })}
  </section>`;

  const ins = buildInsights(now);
  if (ins.length)
    h += `<section><div class="sec-head"><h3>💡 ${t('home.tips')}</h3>${ins.length > 3 ? `<button class="link" data-action="goStatsTips">${t('home.allTips', { n: ins.length })}</button>` : ''}</div>
      ${ins.slice(0, 3).map(insightCard).join('')}</section>`;

  const lim = limitStatus(now).slice(0, 3);
  if (lim.length)
    h += `<section class="card"><div class="card-head"><h3>${t('plans.limits')}</h3><button class="link" data-action="goPlans" data-v="limits">${t('all')}</button></div>${lim.map(limitRow).join('')}</section>`;

  const goals = S.goals.filter((g) => !g.done).slice(0, 3);
  if (goals.length)
    h += `<section class="card"><div class="card-head"><h3>${t('plans.goals')}</h3><button class="link" data-action="goPlans" data-v="goals">${t('all')}</button></div>
      ${goals.map((g) => { const p = goalPlan(g); return `<button class="row goal-mini" data-action="goPlans" data-v="goals"><span class="em">${g.emoji || '🎯'}</span><span class="grow"><b>${esc(g.name)}</b>${meter(p.pct, 'accent')}<small>${fmt(p.saved, g.cur)} / ${fmt(g.target, g.cur)}</small></span><span class="pct">${Math.round(p.pct * 100)}%</span></button>`; }).join('')}</section>`;

  h += `<section class="card"><div class="card-head"><h3>${t('home.recent')}</h3><button class="link" data-action="tab" data-v="tx">${t('all')}</button></div>
    <div class="list">${S.tx.slice(0, 5).map(txRow).join('')}</div></section>`;
  return h;
}

function insightCard(x) {
  const act = x.action ? `data-action="insight" data-a="${x.action}" data-target="${x.target || ''}"` : x.cat ? `data-action="openCat" data-id="${x.cat}"` : '';
  const toneLabel = { warn: t('tone.warn'), good: t('tone.good'), info: t('tone.info') }[x.tone];
  return `<${act ? 'button' : 'div'} class="insight ${x.tone}" ${act}>
    <span class="ins-ic">${x.icon}</span>
    <span class="grow"><span class="tone-l">${toneLabel}</span><b>${esc(x.title)}</b><span class="ins-t">${esc(x.text)}</span></span>
  </${act ? 'button' : 'div'}>`;
}

function meter(ratio, tone = 'accent') {
  return `<span class="meter ${tone}"><i style="width:${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%"></i></span>`;
}

/* ================= TRANSACTIONS ================= */
function renderTx() {
  if (!S.tx.length) return empty('🧾', t('tx.empty'), t('tx.emptyText'), `<button class="btn primary" data-action="addTx">${t('tx.add')}</button>`);
  return `<div class="search">${icon('search')}<input id="q" type="search" placeholder="${t('tx.search')}" value="${esc(ui.q)}" autocomplete="off"></div>
    <div class="filters">
      ${seg('ftype', [['all', t('tx.all')], ['exp', t('tx.exp')], ['inc', t('tx.inc')]], ui.ftype, 'small')}
      <select id="facc" class="select small"><option value="">${t('tx.allAcc')}</option>${S.accounts.map((a) => `<option value="${a.id}" ${ui.facc === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
    </div>
    ${ui.fcat ? `<button class="chip on" data-action="clearCat">${cat(ui.fcat).emoji} ${esc(catName(ui.fcat))} ${icon('x')}</button>` : ''}
    <div id="txList">${txList()}</div>`;
}

function txFiltered() {
  const q = ui.q.trim().toLowerCase();
  return S.tx.filter((x) => {
    if (ui.facc && x.acc !== ui.facc) return false;
    if (ui.fcat && x.cat !== ui.fcat) return false;
    const k = cat(x.cat).kind;
    if (ui.ftype === 'exp' && k !== 'exp') return false;
    if (ui.ftype === 'inc' && k !== 'inc') return false;
    if (q && !`${x.desc} ${catName(x.cat)} ${x.note || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function txList() {
  const list = txFiltered();
  if (!list.length) return `<p class="muted center pad">${t('tx.nothing')}</p>`;
  let h = '', day = null, buf = [], dayExp = 0;
  const flush = () => {
    if (!buf.length) return;
    h += `<div class="day-head"><span>${fmtDate(day, { weekday: 'short', day: 'numeric', month: 'long' })}</span><span>${dayExp ? '−' + fmt(dayExp) : ''}</span></div><div class="card list">${buf.join('')}</div>`;
    buf = [];
    dayExp = 0;
  };
  for (const x of list.slice(0, ui.limit)) {
    const d = +startOf(x.date, 'day');
    if (d !== day) { flush(); day = d; }
    buf.push(txRow(x));
    if (cat(x.cat).kind === 'exp') dayExp -= txBase(x);
  }
  flush();
  if (list.length > ui.limit) h += `<button class="btn ghost wide" data-action="more">${t('tx.more', { n: list.length - ui.limit })}</button>`;
  return h;
}

/* ================= STATS ================= */
const N_BARS = { day: 14, week: 12, month: 12 };
function periodLabel(a, unit) {
  if (unit === 'day') return fmtDate(a, { weekday: 'long', day: 'numeric', month: 'long' });
  if (unit === 'week') return `${fmtDate(a, { day: 'numeric', month: 'short' })} – ${fmtDate(+addUnit(a, 'day', 6), { day: 'numeric', month: 'short' })}`;
  return fmtDate(a, { month: 'long', year: 'numeric' });
}
function shortLabel(s, unit) {
  if (unit === 'day') return new Date(s).getDate();
  if (unit === 'week') return fmtDate(s, { day: 'numeric', month: 'numeric' });
  return fmtDate(s, { month: 'short' }).replace('.', '');
}

function renderStats() {
  if (!S.tx.length) return empty('📊', t('stats.empty'), t('stats.emptyText'), `<button class="btn primary" data-action="demoLoad">✨ ${t('home.demo')}</button>`);
  const now = Date.now();
  const unit = ui.period, kind = ui.kind;
  const a = startOf(ui.anchor, unit), b = addUnit(a, unit, 1), pa = addUnit(a, unit, -1);
  const ongoing = now < +b;
  const el = ongoing ? now - +a : +b - +a;
  const total = kind === 'exp' ? spend(+a, +b) : income(+a, +b);
  const prevTotal = kind === 'exp' ? spend(+pa, +pa + el) : income(+pa, +pa + el);

  // keep the selected bar inside the chart window
  const N = N_BARS[unit];
  const endS = +startOf(ui.chartEnd, unit);
  const startS = +addUnit(endS, unit, -(N - 1));
  if (+a > endS || +a < startS) ui.chartEnd = +a;
  const ser = series(unit, N, ui.chartEnd, kind);
  const nonZero = ser.filter((p) => p.value > 0);
  const avg = nonZero.length ? nonZero.reduce((s, p) => s + p.value, 0) / nonZero.length : 0;

  const days = Math.max(1, el / DAY);
  let h = `${seg('period', [['day', t('p.day')], ['week', t('p.week')], ['month', t('p.month')]], unit)}
  <div class="pnav"><button class="icon-btn" data-action="pnav" data-d="-1" aria-label="prev">${icon('left')}</button>
    <b>${periodLabel(a, unit)}</b>
    <button class="icon-btn" data-action="pnav" data-d="1" ${ongoing ? 'disabled' : ''} aria-label="next">${icon('right')}</button></div>
  <section class="card">
    ${seg('kind', [['exp', t('tx.exp')], ['inc', t('tx.inc')]], kind, 'small')}
    <div class="hero-num mid">${fmt(total)}</div>
    <div class="hero-sub">${deltaBadge(total, prevTotal, kind === 'inc')}${prevTotal ? `<span class="muted">${t('stats.vs.' + unit)}${ongoing && unit !== 'day' ? ' ' + t('stats.samePeriod') : ''} (${fmt(prevTotal)})</span>` : ''}</div>
    ${unit !== 'day' && kind === 'exp' ? `<div class="kv"><span>${t('stats.perDay')}</span><b>${fmt(total / days)}</b></div>` : ''}
    ${columnChart(ser.map((p) => ({ label: shortLabel(p.start, unit), value: p.value, key: p.start, active: p.start === +a })), { width: chartWidth(), height: 180, action: 'pickBar', avg })}
    <div class="legend-line"><i class="lg-avg"></i>${t('stats.avgLine')}: ${fmt(avg)}</div>
  </section>`;

  const cats = byCat(+a, +b, kind);
  const prevCats = new Map(byCat(+pa, +pa + el, kind));
  if (cats.length) {
    const max = cats[0][1];
    h += `<section class="card"><div class="card-head"><h3>${kind === 'exp' ? t('stats.where') : t('stats.from')}</h3></div>
      ${cats.map(([id, v]) => { const c = cat(id); return `<button class="row catrow" data-action="openCat" data-id="${id}">
        <span class="em">${c.emoji}</span>
        <span class="grow"><span class="catline"><b>${esc(catName(c))}</b><span class="amt">${fmt(v)}</span></span>
        <span class="bar"><i style="width:${((v / max) * 100).toFixed(1)}%"></i></span>
        <span class="catline sub"><small>${Math.round((v / total) * 100)}%</small>${deltaBadge(v, prevCats.get(id), kind === 'inc')}</span></span></button>`; }).join('')}
    </section>`;
  } else h += `<p class="muted center pad">${t('stats.none')}</p>`;

  if (unit === 'month' && kind === 'exp') h += nwsCard(+a, +b);

  if (kind === 'exp' && unit !== 'day') {
    const top = S.tx.filter((x) => x.date >= +a && x.date < +b && cat(x.cat).kind === 'exp' && x.amount < 0).sort((p, q) => txBase(p) - txBase(q)).slice(0, 3);
    if (top.length) h += `<section class="card"><div class="card-head"><h3>${t('stats.biggest')}</h3></div><div class="list">${top.map(txRow).join('')}</div></section>`;
  }

  const ins = buildInsights(now);
  if (ins.length) h += `<section id="tips"><div class="sec-head"><h3>💡 ${t('home.tips')}</h3></div>${ins.map(insightCard).join('')}</section>`;
  return h;
}

function nwsCard(from, to) {
  const s = splitNWS(from, to);
  const totalOut = s.needs + s.wants;
  if (!totalOut) return '';
  const base = Math.max(s.inc, totalOut);
  const parts = [['needs', s.needs, 50], ['wants', s.wants, 30], ['savings', s.savings, 20]];
  return `<section class="card">
    <div class="card-head"><h3>${t('nws.title')}</h3><button class="link" data-action="nwsInfo">?</button></div>
    <div class="stack-bar">${parts.filter(([, v]) => v > 0).map(([k, v]) => `<i class="nws-${k}" style="flex:${v}" title="${t('nws.' + k)}"></i>`).join('')}</div>
    <div class="nws-legend">${parts.map(([k, v, target]) => `<div><span class="sw nws-${k}"></span><span class="grow">${t('nws.' + k)}</span><b>${s.inc ? Math.round((v / base) * 100) + '%' : fmt(v)}</b><small class="muted">${t('nws.target')} ${target}%</small></div>`).join('')}</div>
    ${!s.inc ? `<p class="muted small">${t('nws.noInc')}</p>` : ''}
  </section>`;
}

/* ================= PLANS ================= */
function renderPlans() {
  let h = seg('plans', [['goals', t('plans.goals')], ['limits', t('plans.limits')], ['subs', t('plans.subs')]], ui.plans);
  if (ui.plans === 'goals') h += renderGoals();
  else if (ui.plans === 'limits') h += renderLimits();
  else h += renderSubs();
  return h;
}

function renderGoals() {
  const active = S.goals.filter((g) => !g.done);
  const done = S.goals.filter((g) => g.done);
  let h = '';
  if (!S.goals.length) h += empty('🎯', t('goal.empty'), t('goal.emptyText'));
  else {
    const totalLeft = active.reduce((s, g) => s + convert(goalPlan(g).remaining, g.cur, S.base), 0);
    const perMonth = active.reduce((s, g) => { const p = goalPlan(g); return s + (p.perMonth ? convert(p.perMonth, g.cur, S.base) : 0); }, 0);
    if (active.length) h += `<div class="tiles"><div class="tile"><div class="label">${t('goal.leftAll')}</div><div class="val">${fmt(totalLeft)}</div></div><div class="tile"><div class="label">${t('goal.needMonth')}</div><div class="val">${perMonth ? fmt(perMonth) : '—'}</div></div></div>`;
  }
  h += active.map(goalCard).join('');
  h += `<button class="btn primary wide" data-action="goalEdit">${icon('plus')} ${t('goal.new')}</button>`;
  if (done.length) h += `<div class="sec-head"><h3>🎉 ${t('goal.done')}</h3></div>` + done.map(goalCard).join('');
  return h;
}

function goalCard(g) {
  const p = goalPlan(g);
  const pct = Math.round(p.pct * 100);
  let plan = '';
  if (g.done) plan = t('goal.reached');
  else if (p.overdue) plan = `⏰ ${t('goal.overdue')}`;
  else if (p.perMonth) plan = t('goal.plan', { m: fmt(p.perMonth, g.cur), w: fmt(p.perWeek, g.cur), d: fmtDate(g.deadline, { month: 'long', year: 'numeric' }) });
  else plan = t('goal.noDeadline');
  let eta = '';
  if (p.eta && !g.done) {
    const late = g.deadline && p.eta > g.deadline;
    eta = `<div class="goal-eta ${late ? 'late' : 'ok'}">${late ? '⚠️' : '✅'} ${t('goal.eta', { d: fmtDate(p.eta, { month: 'long', year: 'numeric' }) })}${late ? ' — ' + t('goal.late') : ''}</div>`;
  }
  const jar = g.jarId && S.mono?.jars?.find((j) => j.id === g.jarId);
  return `<section class="card goal ${g.done ? 'is-done' : ''}">
    <div class="goal-top"><span class="em big">${g.emoji || '🎯'}</span>
      <span class="grow"><b>${esc(g.name)}</b><small>${fmt(p.saved, g.cur)} ${t('goal.of')} ${fmt(g.target, g.cur)}${g.cur !== S.base ? ` · ≈ ${fmt(convert(g.target, g.cur, S.base))}` : ''}</small></span>
      <span class="pct">${pct}%</span></div>
    ${meter(p.pct, g.done ? 'good' : 'accent')}
    <div class="goal-plan">${g.done ? '' : `<b>${t('goal.left')}: ${fmt(p.remaining, g.cur)}</b> · `}${plan}</div>
    ${eta}
    ${jar ? `<div class="muted small">🐱 ${t('goal.jarLinked', { j: esc(jar.title) })}</div>` : ''}
    <div class="goal-actions">
      ${!g.done && !jar ? `<button class="btn small primary" data-action="goalAdd" data-id="${g.id}">${icon('plus')} ${t('goal.add')}</button>` : ''}
      <button class="btn small ghost" data-action="goalEdit" data-id="${g.id}">${t('edit')}</button>
    </div></section>`;
}

function limitRow(l) {
  const c = cat(l.id);
  const tone = l.ratio >= 1 ? 'bad' : l.ratio >= 0.8 ? 'warn' : 'accent';
  const status = l.ratio >= 1 ? `⛔ ${t('lim.over', { v: fmt(-l.left) })}` : l.ratio >= 0.8 ? `⚠️ ${t('lim.left', { v: fmt(l.left), d: fmt(l.perDay) })}` : t('lim.left', { v: fmt(l.left), d: fmt(l.perDay) });
  return `<button class="row limit" data-action="limitEdit" data-id="${l.id}"><span class="em">${c.emoji}</span>
    <span class="grow"><span class="catline"><b>${esc(catName(c))}</b><span>${fmt(l.spent)} <small class="muted">/ ${fmt(l.limit)}</small></span></span>
    ${meter(l.ratio, tone)}<small class="lim-st ${tone}">${status}</small></span></button>`;
}

function renderLimits() {
  const ls = limitStatus();
  let h = '';
  if (!ls.length) h += empty('🚧', t('lim.empty'), t('lim.emptyText'));
  else {
    const tl = ls.reduce((s, l) => s + l.limit, 0), ts = ls.reduce((s, l) => s + l.spent, 0);
    h += `<section class="card"><div class="card-head"><h3>${fmtDate(Date.now(), { month: 'long' })}</h3><span class="muted">${fmt(ts)} / ${fmt(tl)}</span></div>${ls.map(limitRow).join('')}</section>`;
  }
  h += `<div class="stack"><button class="btn primary wide" data-action="limitEdit">${icon('plus')} ${t('lim.add')}</button>
    ${S.tx.length ? `<button class="btn ghost wide" data-action="limitSuggest">✨ ${t('lim.suggest')}</button>` : ''}</div>`;
  return h;
}

function renderSubs() {
  const subs = detectSubs();
  const m = subs.reduce((s, x) => s + x.monthly, 0);
  let h = '';
  if (subs.length) {
    h += `<div class="tiles"><div class="tile"><div class="label">${t('subs.month')}</div><div class="val">${fmt(m)}</div></div><div class="tile"><div class="label">${t('subs.year')}</div><div class="val">${fmt(m * 12)}</div></div></div>`;
    h += `<section class="card list">${subs.map((s) => `<button class="row" data-action="subEdit" data-key="${esc(s.key || s.id)}">
      <span class="em">${cat(s.cat).emoji}</span>
      <span class="grow"><b>${esc(s.name)}</b><small>${t('subs.per.' + s.period)}${s.next ? ' · ' + t('subs.next', { d: fmtDate(s.next, { day: 'numeric', month: 'short' }) }) : ''}${s.auto ? ' · ' + t('subs.auto') : ''}</small></span>
      <span class="amt">${fmt(s.amount, s.cur)}${s.cur !== S.base || s.period !== 'm' ? `<small>${fmt(s.monthly)}/${t('u.mo')}</small>` : ''}</span></button>`).join('')}</section>`;
  } else h += empty('🔁', t('subs.empty'), t('subs.emptyText'));
  h += `<button class="btn primary wide" data-action="subEdit">${icon('plus')} ${t('subs.add')}</button>`;
  return h;
}

/* ================= MORE / SETTINGS ================= */
function renderMore() {
  const r = S.rates;
  const accs = S.accounts.map((a) => {
    const b = accBalance(a);
    const n = S.tx.filter((x) => x.acc === a.id).length;
    const ic = a.type === 'mono' ? '🐱' : Imp.PRESETS[a.type]?.emoji || (a.type === 'crypto' ? '🪙' : '👛');
    return `<button class="row" data-action="accEdit" data-id="${a.id}"><span class="em">${ic}</span><span class="grow"><b>${esc(a.name)}</b><small>${t('acc.ops', { n })}${a.include === false ? ' · ' + t('acc.hidden') : ''}</small></span><span class="amt">${b != null ? fmt(b, a.cur) : '—'}</span></button>`;
  }).join('');
  return `<section class="card"><div class="card-head"><h3>${t('set.banks')}</h3></div>
    ${accs ? `<div class="list">${accs}</div>` : `<p class="muted">${t('set.noAcc')}</p>`}
    <div class="btn-grid">
      <button class="btn" data-action="openMono">🐱 Monobank</button>
      <button class="btn" data-action="openImport">📄 ${t('set.import')}</button>
      <button class="btn ghost" data-action="accEdit">${icon('plus')} ${t('set.addAcc')}</button>
    </div></section>

  <section class="card settings">
    <div class="set-row"><span>${t('set.lang')}</span>${seg('setLang', [['ru', 'RU'], ['en', 'EN']], S.lang, 'small')}</div>
    <div class="set-row"><span>${t('set.cur')}</span>${seg('setBase', CURRENCIES.map((c) => [c, CUR_SYM[c]]), S.base, 'small')}</div>
    <div class="set-row"><span>${t('set.theme')}</span>${seg('setTheme', [['auto', t('th.auto')], ['light', '☀️'], ['dark', '🌙']], S.theme, 'small')}</div>
    <button class="set-row" data-action="ratesSheet"><span>${t('set.rates')}<small>${CURRENCIES.filter((c) => c !== 'UAH').map((c) => `1 ${CUR_SYM[c]} = ${fmtNum(r[c], 2)} ₴`).join(' · ')}</small></span>${icon('chev')}</button>
    <button class="set-row" data-action="catsSheet"><span>${t('set.cats')}</span>${icon('chev')}</button>
  </section>

  <section class="card settings">
    <button class="set-row" data-action="pinSheet"><span>🔒 ${t('set.pin')}<small>${F.pinOn ? t('set.pinOn') : t('set.pinOff')}</small></span>${icon('chev')}</button>
    ${F.pinOn ? `<div class="set-row"><span>${t('set.autolock')}</span>${seg('setAutolock', [[1, '1 ' + t('u.min')], [5, '5'], [15, '15']], S.settings.autoLockMin, 'small')}</div>` : ''}
  </section>

  <section class="card settings">
    <button class="set-row" data-action="backup"><span>💾 ${t('set.backup')}<small>${t('set.backupSub')}</small></span>${icon('chev')}</button>
    <label class="set-row"><span>📥 ${t('set.restore')}</span><input type="file" id="restoreFile" hidden>${icon('chev')}</label>
    <button class="set-row" data-action="exportCsv"><span>📤 ${t('set.csv')}</span>${icon('chev')}</button>
    ${S.demo ? `<button class="set-row" data-action="demoClear"><span>🧹 ${t('home.demoClear')}</span>${icon('chev')}</button>` : `<button class="set-row" data-action="demoLoad"><span>✨ ${t('home.demo')}</span>${icon('chev')}</button>`}
    <button class="set-row" data-action="installSheet"><span>📲 ${t('set.install')}</span>${icon('chev')}</button>
    <button class="set-row danger" data-action="wipe"><span>🗑️ ${t('set.wipe')}</span>${icon('chev')}</button>
  </section>
  <p class="muted center small pad">${t('set.privacy')}</p>`;
}

/* ================= sheets ================= */
function sheet(title, body, { onMount, back } = {}) {
  const root = $('#sheet-root');
  const was = root.classList.contains('open');
  root.innerHTML = `<div class="sheet-bg" data-action="closeSheet"></div>
    <div class="sheet ${was ? 'no-anim' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head">${back ? `<button class="icon-btn" data-action="${back}" aria-label="back">${icon('back')}</button>` : ''}<h2>${esc(title)}</h2><button class="icon-btn" data-action="closeSheet" aria-label="close">${icon('x')}</button></div>
      <div class="sheet-body">${body}</div></div>`;
  root.classList.add('open');
  document.body.classList.add('noscroll');
  onMount?.(root.querySelector('.sheet'));
}
function closeSheet() {
  const root = $('#sheet-root');
  if (!root) return;
  root.classList.remove('open');
  root.innerHTML = '';
  document.body.classList.remove('noscroll');
}
function confirmSheet(text, okLabel, fn, danger = true) {
  sheet(t('confirm'), `<p>${text}</p><div class="stack"><button class="btn ${danger ? 'danger' : 'primary'}" data-action="confirmOk">${okLabel}</button><button class="btn ghost" data-action="closeSheet">${t('cancel')}</button></div>`);
  F.confirm = fn;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- transaction form ---------- */
function defaultAccount() {
  return S.accounts.find((a) => a.id === F.lastAcc) || S.accounts.find((a) => a.type === 'cash' && !a.demo) || S.accounts[0];
}
function txSheet(x) {
  const isNew = !x;
  const da = defaultAccount();
  F = { ...F, tx: x, kind: x ? cat(x.cat).kind : 'exp', cat: x ? x.cat : 'food', delArm: false, allCats: false };
  const accOpts = S.accounts.map((a) => `<option value="${a.id}" ${(x ? x.acc : da?.id) === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const key = x ? merchantKey(x.desc) : '';
  sheet(isNew ? t('tx.add') : t('tx.edit'), `
    ${seg('txKind', [['exp', t('tx.expOne')], ['inc', t('tx.incOne')], ['tr', t('tx.trOne')]], F.kind)}
    <div class="amount-in"><input id="fAmount" inputmode="decimal" placeholder="0" value="${x ? Math.abs(x.amount) : ''}" autocomplete="off">
      <select id="fCur" class="select">${CURRENCIES.map((c) => `<option ${(x ? x.cur : da?.cur || S.base) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="label">${t('tx.cat')}</div>
    <div class="cat-grid" id="catGrid">${catGrid()}</div>
    <label class="field"><span>${t('tx.desc')}</span><input id="fDesc" value="${esc(x?.desc || '')}" placeholder="${t('tx.descPh')}"></label>
    <div class="row2">
      <label class="field"><span>${t('tx.date')}</span><input id="fDate" type="date" value="${isoDate(x ? x.date : Date.now())}"></label>
      <label class="field"><span>${t('tx.acc')}</span><select id="fAcc" class="select">${accOpts}<option value="__new" ${!S.accounts.length ? 'selected' : ''}>${t('tx.cashNew')}</option></select></label>
    </div>
    <label class="field"><span>${t('tx.note')}</span><input id="fNote" value="${esc(x?.note || '')}"></label>
    ${x && key && x.src !== 'manual' ? `<label class="check"><input type="checkbox" id="fRemember" checked> ${t('tx.remember', { k: esc(key) })}</label>` : ''}
    <button class="btn primary big" data-action="txSave">${t('save')}</button>
    ${x ? `<button class="btn ghost danger-text" data-action="txDel" id="delBtn">${t('delete')}</button>` : ''}
    ${x && x.src !== 'manual' ? `<p class="muted small center">${t('tx.src.' + x.src) || ''}</p>` : ''}
  `, { onMount: (el) => isNew && setTimeout(() => el.querySelector('#fAmount')?.focus(), 250) });
}
function catGrid() {
  // most used categories first; the rest behind "more"
  const since = Date.now() - 90 * DAY;
  const used = new Map();
  for (const x of S.tx) if (x.date >= since) used.set(x.cat, (used.get(x.cat) || 0) + 1);
  const list = S.cats.filter((c) => c.kind === F.kind && !c.hidden).sort((a, b) => (used.get(b.id) || 0) - (used.get(a.id) || 0));
  const cut = 7;
  let shown = F.allCats || list.length <= cut + 1 ? list : list.slice(0, cut);
  if (!shown.some((c) => c.id === F.cat)) shown = [...shown.slice(0, cut - 1), list.find((c) => c.id === F.cat)].filter(Boolean);
  const btn = (c) => `<button data-action="pickCat" data-id="${c.id}" class="${F.cat === c.id ? 'on' : ''}"><span>${c.emoji}</span><small>${esc(catName(c))}</small></button>`;
  return shown.map(btn).join('') + (shown.length < list.length ? `<button data-action="allCats"><span>⋯</span><small>${t('all')}</small></button>` : '');
}

/* ---------- goal forms ---------- */
function goalSheet(g) {
  F.goal = g || null;
  F.emoji = g?.emoji || '🎯';
  const jars = S.mono?.jars || [];
  sheet(g ? t('goal.edit') : t('goal.new'), `
    <label class="field"><span>${t('goal.name')}</span><input id="gName" value="${esc(g?.name || '')}" placeholder="${t('goal.namePh')}"></label>
    <div class="label">${t('goal.icon')}</div>
    <div class="emoji-row" id="emojiRow">${GOAL_EMOJI.map((e) => `<button data-action="pickEmoji" data-v="${e}" class="${F.emoji === e ? 'on' : ''}">${e}</button>`).join('')}</div>
    <div class="amount-in"><input id="gTarget" inputmode="decimal" placeholder="${t('goal.target')}" value="${g?.target || ''}">
      <select id="gCur" class="select">${CURRENCIES.map((c) => `<option ${(g?.cur || S.base) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="row2">
      <label class="field"><span>${t('goal.saved')}</span><input id="gSaved" inputmode="decimal" value="${g ? g.saved || 0 : ''}" placeholder="0"></label>
      <label class="field"><span>${t('goal.deadline')}</span><input id="gDeadline" type="date" value="${g?.deadline ? isoDate(g.deadline) : ''}"></label>
    </div>
    ${jars.length ? `<label class="field"><span>🐱 ${t('goal.jar')}</span><select id="gJar" class="select"><option value="">${t('goal.noJar')}</option>${jars.map((j) => `<option value="${j.id}" ${g?.jarId === j.id ? 'selected' : ''}>${esc(j.title)} · ${fmt(j.balance, j.cur)}</option>`).join('')}</select></label>` : ''}
    <p class="muted small">${t('goal.hint')}</p>
    <button class="btn primary big" data-action="goalSave">${t('save')}</button>
    ${g ? `<button class="btn ghost" data-action="goalToggleDone">${g.done ? t('goal.reopen') : '🎉 ' + t('goal.markDone')}</button><button class="btn ghost danger-text" data-action="goalDel">${t('delete')}</button>` : ''}
  `);
}
function goalAddSheet(g) {
  F.goal = g;
  const p = goalPlan(g);
  sheet(`${g.emoji} ${g.name}`, `
    <p class="muted">${fmt(p.saved, g.cur)} ${t('goal.of')} ${fmt(g.target, g.cur)}${p.perMonth ? ' · ' + t('goal.recommend', { v: fmt(p.perMonth, g.cur) }) : ''}</p>
    <div class="amount-in"><input id="gAmt" inputmode="decimal" placeholder="0" value="${p.perMonth ? Math.ceil(p.perMonth) : ''}"><span class="cur-tag">${g.cur}</span></div>
    <button class="btn primary big" data-action="goalContrib" data-sign="1">${icon('plus')} ${t('goal.add')}</button>
    <button class="btn ghost" data-action="goalContrib" data-sign="-1">− ${t('goal.withdraw')}</button>
    ${(g.history || []).length ? `<div class="label">${t('goal.history')}</div><div class="list">${[...g.history].reverse().slice(0, 8).map((h) => `<div class="row"><span class="grow">${fmtDate(h.d)}</span><span class="amt ${h.a > 0 ? 'pos' : ''}">${fmt(h.a, g.cur, { sign: true })}</span></div>`).join('')}</div>` : ''}
  `, { onMount: (el) => setTimeout(() => el.querySelector('#gAmt')?.select(), 250) });
}

/* ---------- limits ---------- */
function limitSheet(id) {
  const has = id && S.limits[id];
  const m0 = startOf(Date.now(), 'month');
  const avgOf = (cid) => {
    const vals = [1, 2, 3].map((i) => { const s = addUnit(m0, 'month', -i); return spend(+s, +addUnit(s, 'month', 1), (x) => x.cat === cid); });
    return vals.reduce((a, b) => a + b, 0) / 3;
  };
  F.limitCat = id || S.cats.find((c) => c.kind === 'exp' && !S.limits[c.id])?.id;
  sheet(has ? t('lim.edit') : t('lim.add'), `
    <label class="field"><span>${t('tx.cat')}</span><select id="lCat" class="select" ${has ? 'disabled' : ''}>${S.cats.filter((c) => c.kind === 'exp').map((c) => `<option value="${c.id}" ${F.limitCat === c.id ? 'selected' : ''}>${c.emoji} ${esc(catName(c))}</option>`).join('')}</select></label>
    <div class="amount-in"><input id="lAmt" inputmode="decimal" placeholder="0" value="${has ? S.limits[id] : ''}"><span class="cur-tag">${S.base} / ${t('u.mo')}</span></div>
    <p class="muted small" id="lHint">${t('lim.avg', { v: fmt(avgOf(F.limitCat)) })}</p>
    <button class="btn primary big" data-action="limitSave">${t('save')}</button>
    ${has ? `<button class="btn ghost danger-text" data-action="limitDel">${t('delete')}</button>` : ''}
  `, {
    onMount: (el) => el.querySelector('#lCat')?.addEventListener('change', (e) => { F.limitCat = e.target.value; $('#lHint').textContent = t('lim.avg', { v: fmt(avgOf(F.limitCat)) }); }),
  });
}
function niceRound(v) {
  const step = v > 5000 ? 500 : v > 1000 ? 100 : 50;
  return Math.max(step, Math.round(v / step) * step);
}
function limitSuggestSheet() {
  const m0 = startOf(Date.now(), 'month');
  const from = +addUnit(m0, 'month', -3);
  const sugg = byCat(from, +m0).filter(([id]) => !['home', 'fees'].includes(id)).slice(0, 7).map(([id, v]) => [id, niceRound((v / 3) * 0.9)]);
  F.sugg = sugg;
  sheet(t('lim.suggest'), sugg.length ? `<p class="muted">${t('lim.suggestText')}</p>
    <div class="list">${sugg.map(([id, v]) => `<label class="row"><input type="checkbox" checked data-sugg="${id}"><span class="em">${cat(id).emoji}</span><span class="grow"><b>${esc(catName(id))}</b></span><span class="amt">${fmt(v)}</span></label>`).join('')}</div>
    <button class="btn primary big" data-action="limitSuggestApply">${t('lim.apply')}</button>` : `<p class="muted">${t('lim.noData')}</p>`);
}

/* ---------- subscriptions ---------- */
function subSheet(key) {
  const all = detectSubs();
  const s = key ? all.find((x) => (x.key || x.id) === key) : null;
  F.sub = s;
  if (s && s.auto) {
    const list = S.tx.filter((x) => merchantKey(x.desc) === s.key && x.amount < 0).slice(0, 6);
    return sheet(s.name, `<p class="muted">${t('subs.autoText', { n: s.count })}</p>
      <div class="kv"><span>${t('subs.per.' + s.period)}</span><b>${fmt(s.amount, s.cur)}</b></div>
      <div class="kv"><span>${t('subs.year')}</span><b>${fmt(s.monthly * 12)}</b></div>
      <div class="list">${list.map(txRow).join('')}</div>
      <button class="btn ghost" data-action="subHide">${t('subs.hide')}</button>`);
  }
  sheet(s ? t('subs.edit') : t('subs.add'), `
    <label class="field"><span>${t('subs.name')}</span><input id="sName" value="${esc(s?.name || '')}" placeholder="Netflix"></label>
    <div class="amount-in"><input id="sAmt" inputmode="decimal" placeholder="0" value="${s?.amount || ''}">
      <select id="sCur" class="select">${CURRENCIES.map((c) => `<option ${(s?.cur || S.base) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="row2">
      <label class="field"><span>${t('subs.period')}</span><select id="sPer" class="select">${['m', 'y', 'w'].map((p) => `<option value="${p}" ${s?.period === p ? 'selected' : ''}>${t('subs.per.' + p)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('subs.nextDate')}</span><input id="sNext" type="date" value="${isoDate(s?.next || Date.now())}"></label>
    </div>
    <button class="btn primary big" data-action="subSave">${t('save')}</button>
    ${s ? `<button class="btn ghost danger-text" data-action="subDel">${t('delete')}</button>` : ''}`);
}

/* ---------- category detail ---------- */
function catSheet(id) {
  const c = cat(id);
  const unit = ui.tab === 'stats' ? ui.period : 'month';
  const a = startOf(ui.tab === 'stats' ? ui.anchor : Date.now(), unit), b = addUnit(a, unit, 1);
  const kind = c.kind === 'inc' ? 'inc' : 'exp';
  const ser = series(unit, 8, +a, kind).map((p) => ({ ...p, value: 0 }));
  for (const p of ser)
    for (const x of S.tx) if (x.cat === id && x.date >= p.start && x.date < p.end) p.value += kind === 'exp' ? -txBase(x) : txBase(x);
  const list = S.tx.filter((x) => x.cat === id && x.date >= +a && x.date < +b);
  const nz = ser.filter((p) => p.value > 0);
  const avg = nz.length ? nz.reduce((s, p) => s + p.value, 0) / nz.length : 0;
  F.catId = id;
  sheet(`${c.emoji} ${catName(c)}`, `
    <div class="kv"><span>${periodLabel(a, unit)}</span><b>${fmt(Math.max(0, ser[ser.length - 1].value))}</b></div>
    <div class="kv"><span>${t('cat.avg.' + unit)}</span><b>${fmt(avg)}</b></div>
    ${columnChart(ser.map((p) => ({ label: shortLabel(p.start, unit), value: Math.max(0, p.value), key: p.start, active: p.start === +a })), { width: Math.min(window.innerWidth, 600) - 48, height: 150, avg })}
    ${c.kind === 'exp' ? `<button class="btn ghost wide" data-action="limitEdit" data-id="${id}">🚧 ${S.limits[id] ? t('lim.edit') + ': ' + fmt(S.limits[id]) : t('lim.add')}</button>` : ''}
    <div class="label">${t('cat.ops', { n: list.length })}</div>
    <div class="list">${list.slice(0, 30).map(txRow).join('') || `<p class="muted">${t('stats.none')}</p>`}</div>
    ${list.length ? `<button class="btn ghost wide" data-action="catToTx" data-id="${id}">${t('cat.allOps')}</button>` : ''}`);
}

/* ---------- accounts ---------- */
function accSheet(id) {
  const a = id ? acc(id) : null;
  F.acc = a;
  const types = [['cash', '👛 ' + t('acc.cash')], ['privat', '🟩 Privat24'], ['pekao', '🟥 Bank Pekao'], ['revolut', '⬛ Revolut'], ['crypto', '🪙 ' + t('acc.crypto')], ['other', '🏦 ' + t('acc.other')]];
  const isMono = a?.type === 'mono';
  sheet(a ? a.name : t('set.addAcc'), `
    <label class="field"><span>${t('acc.name')}</span><input id="aName" value="${esc(a?.name || '')}" placeholder="${t('acc.namePh')}"></label>
    ${isMono ? '' : `<div class="row2"><label class="field"><span>${t('acc.type')}</span><select id="aType" class="select">${types.map(([v, l]) => `<option value="${v}" ${a?.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>${t('acc.cur')}</span><select id="aCur" class="select">${CURRENCIES.map((c) => `<option ${(a?.cur || S.base) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
    <label class="field"><span>${t('acc.balance')}</span><input id="aBal" inputmode="decimal" value="${a && a.balance != null ? Math.round(accBalance(a) * 100) / 100 : ''}" placeholder="${t('acc.balancePh')}"></label>`}
    ${isMono ? `<div class="kv"><span>${t('acc.balance')}</span><b>${fmt(a.balance, a.cur)}</b></div><label class="check"><input type="checkbox" id="aSync" ${a.sync !== false ? 'checked' : ''}> ${t('acc.sync')}</label>` : ''}
    <label class="check"><input type="checkbox" id="aInc" ${a?.include !== false ? 'checked' : ''}> ${t('acc.include')}</label>
    <button class="btn primary big" data-action="accSave">${t('save')}</button>
    ${a ? `<button class="btn ghost danger-text" data-action="accDel">${t('acc.del')}</button>` : ''}
    ${a?.type === 'crypto' || (!a && true) ? `<p class="muted small">${t('acc.cryptoHint')}</p>` : ''}`);
}

/* ---------- monobank ---------- */
function monoProgress() {
  const s = Mono.sync;
  if (s.running) {
    const wait = s.nextAt ? Math.max(0, Math.round((s.nextAt - Date.now()) / 1000)) : 0;
    return `<div class="progress-box"><div class="catline"><b>${icon('sync', 'spin')} ${t('mono.syncing')}</b><span>${s.done}/${s.total}</span></div>${meter(s.total ? s.done / s.total : 0, 'accent')}
      <small class="muted">${wait ? t('mono.wait', { s: wait }) : t('mono.loading')}</small><small class="muted">${t('mono.limitNote')}</small></div>`;
  }
  if (s.error) return `<div class="progress-box err">⚠️ ${esc(s.error === 'network' ? t('mono.errNet') : s.error)}</div>`;
  return '';
}
function monoSheet() {
  if (!S.mono?.token) {
    return sheet('Monobank', `
      <p>${t('mono.intro')}</p>
      <ol class="steps"><li>${t('mono.s1')} <a href="https://api.monobank.ua/" target="_blank" rel="noopener">api.monobank.ua</a></li><li>${t('mono.s2')}</li><li>${t('mono.s3')}</li></ol>
      <label class="field"><span>${t('mono.token')}</span><input id="mToken" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="uXXXXXXXXXXXXXXXX"></label>
      <p class="muted small">🔒 ${t('mono.privacy')}</p>
      <button class="btn primary big" data-action="monoConnect">${t('mono.connect')}</button>
      <div id="monoProgress">${monoProgress()}</div>`);
  }
  const accs = S.accounts.filter((a) => a.type === 'mono');
  sheet('Monobank', `
    ${S.mono.name ? `<p class="muted">👤 ${esc(S.mono.name)}</p>` : ''}
    <div id="monoProgress">${monoProgress()}</div>
    <div class="list">${accs.map((a) => `<button class="row" data-action="accEdit" data-id="${a.id}"><span class="em">🐱</span><span class="grow"><b>${esc(a.name)}</b><small>${a.sync === false ? t('mono.off') : a.lastSync ? t('mono.last', { d: ago(a.lastSync) }) : t('mono.never')}</small></span><span class="amt">${fmt(a.balance, a.cur)}</span></button>`).join('')}</div>
    ${(S.mono.jars || []).length ? `<div class="label">${t('mono.jars')}</div><div class="list">${S.mono.jars.map((j) => `<div class="row"><span class="em">🫙</span><span class="grow"><b>${esc(j.title)}</b>${j.goal ? `<small>${t('goal.of')} ${fmt(j.goal, j.cur)}</small>` : ''}</span><span class="amt">${fmt(j.balance, j.cur)}</span></div>`).join('')}</div><p class="muted small">${t('mono.jarsHint')}</p>` : ''}
    <button class="btn primary big" data-action="syncNow" ${Mono.sync.running ? 'disabled' : ''}>${icon('sync')} ${t('mono.syncNow')}</button>
    <div class="label">${t('mono.history')}</div>
    ${seg('monoHistory', [[90, '3 ' + t('u.mo')], [180, '6 ' + t('u.mo')], [365, '12 ' + t('u.mo')]], 0, 'small')}
    <button class="btn ghost" data-action="monoRefresh">${t('mono.refresh')}</button>
    <button class="btn ghost danger-text" data-action="monoOff">${t('mono.disconnect')}</button>`);
}
function monoPickSheet(list) {
  F.monoList = list;
  sheet('Monobank', `<p>${t('mono.pick')}</p>
    <div class="list">${list.map((a, i) => `<label class="row"><input type="checkbox" data-mi="${i}" ${a.cur === 'UAH' || a.balance ? 'checked' : ''}><span class="em">🐱</span><span class="grow"><b>${esc(a.name)}</b></span><span class="amt">${fmt(a.balance, a.cur)}</span></label>`).join('')}</div>
    <div class="label">${t('mono.depth')}</div>
    ${seg('monoDepth', [[31, '1 ' + t('u.mo')], [92, '3'], [183, '6'], [365, '12']], F.monoDepth || 92, 'small')}
    <p class="muted small">${t('mono.depthHint')}</p>
    <button class="btn primary big" data-action="monoAdd">${t('mono.load')}</button>`);
}

/* ---------- import ---------- */
function importSheet() {
  F.imp = { preset: F.imp?.preset || 'privat' };
  const p = F.imp.preset;
  const accs = S.accounts.filter((a) => a.type !== 'mono' || p === 'monofile');
  const match = accs.find((a) => a.type === p) || accs.find((a) => p === 'monofile' && a.type === 'mono');
  sheet(t('imp.title'), `
    <div class="label">${t('imp.bank')}</div>
    <div class="bank-grid">${Object.entries(Imp.PRESETS).map(([k, v]) => `<button data-action="impPreset" data-v="${k}" class="${p === k ? 'on' : ''}"><span>${v.emoji}</span>${k === 'other' ? t('acc.other') : k === 'monofile' ? t('imp.monofile') : v.name}</button>`).join('')}</div>
    <div class="hint-box">${t('imp.how.' + p)}</div>
    <label class="field"><span>${t('imp.toAcc')}</span><select id="iAcc" class="select">${accs.map((a) => `<option value="${a.id}" ${match?.id === a.id ? 'selected' : ''}>${esc(a.name)} · ${a.cur}</option>`).join('')}<option value="__new" ${!match ? 'selected' : ''}>${t('imp.newAcc', { b: p === 'other' ? t('acc.other') : Imp.PRESETS[p].name })}</option></select></label>
    <label class="btn primary big file-btn">📄 ${t('imp.choose')}<input type="file" id="impFile" hidden></label>
    <p class="muted small">${t('imp.privacy')}</p>`);
}

async function onImportFile(file) {
  const preset = F.imp.preset;
  let accId = $('#iAcc').value;
  try {
    toast(t('imp.reading'));
    const rows = await Imp.readTable(file, preset);
    if (rows.length < 2 && !rows.fromPdf) throw new Error(t('imp.emptyFile'));
    const det = Imp.detect(rows, preset);
    F.imp = { ...F.imp, rows, ...det, accId, fileName: file.name };
    importMapSheet();
  } catch (e) {
    toast(e.message === 'lib-load' ? t('imp.xlsxErr') : t('imp.err') + ': ' + e.message);
  }
}

function impAccount() {
  const p = F.imp.preset;
  if (F.imp.accId !== '__new') return acc(F.imp.accId);
  return { id: '__new', cur: Imp.PRESETS[p].cur, type: p === 'monofile' ? 'other' : p };
}
function importMapSheet() {
  const I2 = F.imp;
  const a = impAccount();
  const res = Imp.parseRows(I2.rows, I2.headerIdx, I2.map, { accId: a.id, cur: a.cur, headers: I2.headers });
  I2.result = res;
  const opt = (field, req) => `<label class="field"><span>${t('imp.f.' + field)}${req ? ' *' : ''}</span><select class="select" data-map="${field}"><option value="-1">—</option>${I2.headers.map((h, i) => `<option value="${i}" ${I2.map[field] === i ? 'selected' : ''}>${esc(h || '#' + (i + 1))}</option>`).join('')}</select></label>`;
  const range = res.tx.length ? `${fmtDate(res.tx[res.tx.length - 1].date, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(res.tx[0].date, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  sheet(t('imp.check'), `
    <div class="summary ${res.tx.length ? 'ok' : 'err'}"><b>${res.tx.length ? t('imp.found', { n: res.tx.length }) : res.dups ? t('imp.allDup') : I2.rows.fromPdf ? t('imp.noTxPdf') : t('imp.none')}</b>
      <small>${range}${res.dups ? ' · ' + t('imp.dups', { n: res.dups }) : ''}${res.bad ? ' · ' + t('imp.bad', { n: res.bad }) : ''}</small></div>
    ${res.tx.length ? `<div class="label">${t('imp.preview')}</div><div class="list">${res.tx.slice(0, 5).map((x) => `<div class="row"><span class="em">${cat(x.cat).emoji}</span><span class="grow"><b>${esc(x.desc)}</b><small>${fmtDate(x.date)} · ${esc(catName(x.cat))}</small></span><span class="amt ${x.amount > 0 ? 'pos' : ''}">${fmt(x.amount, x.cur, { sign: true })}</span></div>`).join('')}</div>` : ''}
    ${!res.tx.length && !res.dups && I2.rows.fromPdf ? `<div class="hint-box">${t('imp.pdfNoTx')}</div>` : ''}
    <details ${res.tx.length || I2.rows.fromPdf ? '' : 'open'}><summary>${t('imp.columns')}</summary>
      <div class="map-grid">${opt('date', 1)}${opt('amount', 1)}${opt('desc')}${opt('desc2')}${opt('currency')}${opt('category')}${opt('mcc')}${opt('time')}${opt('fee')}${opt('state')}${opt('balance')}</div>
      <label class="check"><input type="checkbox" id="impInvert" ${I2.map.invert ? 'checked' : ''}> ${t('imp.invert')}</label>
    </details>
    ${res.lastBal ? `<p class="muted small">${t('imp.balFound', { v: fmt(res.lastBal.bal, a.cur), d: fmtDate(res.lastBal.date) })}</p>` : ''}
    <button class="btn primary big" data-action="impCommit" ${res.tx.length || (res.lastBal && a.id !== '__new') ? '' : 'disabled'}>${res.tx.length ? t('imp.do', { n: res.tx.length }) : t('imp.updBal')}</button>`, { back: 'openImport' });
}

/* ---------- categories ---------- */
function catsSheet() {
  const group = (kind) => S.cats.filter((c) => c.kind === kind).map((c) => `<button class="row" data-action="catEdit" data-id="${c.id}"><span class="em">${c.emoji}</span><span class="grow"><b>${esc(catName(c))}</b>${c.kind === 'exp' ? `<small>${t('nws.' + (c.group === 'need' ? 'needs' : 'wants'))}</small>` : ''}</span>${c.hidden ? `<small class="muted">${t('cat.hidden')}</small>` : ''}</button>`).join('');
  sheet(t('set.cats'), `<div class="label">${t('tx.exp')}</div><div class="list">${group('exp')}</div>
    <div class="label">${t('tx.inc')}</div><div class="list">${group('inc')}</div>
    <div class="label">${t('cat.transfers')}</div><div class="list">${group('tr')}</div>
    <p class="muted small">${t('cat.trHint')}</p>
    <button class="btn primary wide" data-action="catEdit">${icon('plus')} ${t('cat.new')}</button>
    ${Object.keys(S.rules).length ? `<button class="btn ghost wide" data-action="rulesReset">${t('cat.rulesReset', { n: Object.keys(S.rules).length })}</button>` : ''}`);
}
function catEditSheet(id) {
  const c = id ? cat(id) : null;
  F.catEdit = c;
  F.emoji = c?.emoji || '📦';
  sheet(c ? catName(c) : t('cat.new'), `
    <label class="field"><span>${t('cat.name')}</span><input id="cName" value="${esc(c ? catName(c) : '')}"></label>
    <div class="label">${t('goal.icon')}</div>
    <div class="emoji-row" id="emojiRow">${CAT_EMOJI.map((e) => `<button data-action="pickEmoji" data-v="${e}" class="${F.emoji === e ? 'on' : ''}">${e}</button>`).join('')}</div>
    <label class="field"><span>${t('cat.kind')}</span><select id="cKind" class="select">${[['exp', t('tx.expOne')], ['inc', t('tx.incOne')], ['tr', t('cat.trKind')]].map(([v, l]) => `<option value="${v}" ${(c?.kind || 'exp') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>${t('cat.group')}</span><select id="cGroup" class="select"><option value="need" ${c?.group === 'need' ? 'selected' : ''}>${t('nws.needs')}</option><option value="want" ${c?.group !== 'need' ? 'selected' : ''}>${t('nws.wants')}</option></select></label>
    <button class="btn primary big" data-action="catSave">${t('save')}</button>
    ${c ? `<button class="btn ghost" data-action="catHide">${c.hidden ? t('cat.show') : t('cat.hide')}</button>` : ''}`, { back: 'catsSheet' });
}

/* ---------- PIN ---------- */
async function pinSheet() {
  const meta = await getMeta();
  if (meta.pin) {
    sheet(t('set.pin'), `<p class="muted">${t('pin.onText')}</p>
      <button class="btn" data-action="pinChange">${t('pin.change')}</button>
      <button class="btn ghost danger-text" data-action="pinOff">${t('pin.off')}</button>`);
  } else {
    sheet(t('set.pin'), `<p>${t('pin.offText')}</p><p class="muted small">${t('pin.warn')}</p><button class="btn primary big" data-action="pinSet">${t('pin.set')}</button>`);
  }
}
function pinEntrySheet(title, onDone) {
  pinBuf = '';
  sheet(title, `<div class="pin-in">${pinPad(title)}</div>`);
  pinHandler = onDone;
}

/* ================= actions ================= */
const A = {
  tab: (el) => { ui.tab = el.dataset.v; render(); scrollTo(0, 0); },
  closeSheet: () => closeSheet(),
  confirmOk: async () => { const fn = F.confirm; F.confirm = null; closeSheet(); await fn?.(); },

  pinKey: async (el) => {
    const k = el.dataset.k;
    if (k === 'del') pinBuf = pinBuf.slice(0, -1);
    else if (pinBuf.length < 4) pinBuf += k;
    pinDots();
    if (pinBuf.length === 4) {
      const p = pinBuf;
      setTimeout(() => pinHandler?.(p), 120);
    }
  },

  setLang: (el) => { S.lang = el.dataset.v; document.documentElement.lang = S.lang; save(); S.onboarded ? render() : renderOnboarding(); },
  setBase: (el) => { S.base = el.dataset.v; save(); S.onboarded ? render() : renderOnboarding(); },
  setTheme: (el) => { S.theme = el.dataset.v; applyTheme(S.theme); save(); render(); },
  setAutolock: (el) => { S.settings.autoLockMin = +el.dataset.v; save(); render(); },
  onbStart: () => { S.onboarded = true; save(); render(); refreshRates().then((c) => c && render()); },
  onbDemo: () => { S.onboarded = true; loadDemo(); save(); render(); refreshRates().then((c) => c && render()); },
  demoLoad: () => { loadDemo(); save(); render(); toast(t('demo.loaded')); },
  demoClear: () => { clearDemo(); save(); closeSheet(); render(); toast(t('demo.cleared')); },

  addTx: () => txSheet(null),
  editTx: (el) => txSheet(S.tx.find((x) => x.id === el.dataset.id)),
  txKind: (el) => {
    F.kind = el.dataset.v;
    F.cat = S.cats.find((c) => c.kind === F.kind && !c.hidden)?.id;
    el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
    $('#catGrid').innerHTML = catGrid();
  },
  pickCat: (el) => { F.cat = el.dataset.id; $('#catGrid').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); },
  allCats: () => { F.allCats = true; $('#catGrid').innerHTML = catGrid(); },
  txSave: () => {
    const amt = Math.abs(Imp.parseAmount($('#fAmount').value));
    if (!amt) return toast(t('err.amount'));
    let accId = $('#fAcc').value;
    if (accId === '__new' || !accId) {
      let cash = S.accounts.find((a) => a.type === 'cash' && !a.demo);
      if (!cash) { cash = { id: uid(), type: 'cash', name: t('acc.cashName'), cur: $('#fCur').value, balance: null, include: true }; S.accounts.push(cash); }
      accId = cash.id;
    }
    F.lastAcc = accId;
    const old = F.tx;
    const sign = F.kind === 'inc' ? 1 : F.kind === 'exp' ? -1 : old ? Math.sign(old.amount) || -1 : -1;
    const [y, m, d] = $('#fDate').value.split('-').map(Number);
    const keepTime = old ? new Date(old.date) : new Date();
    const date = +new Date(y, m - 1, d, keepTime.getHours(), keepTime.getMinutes(), keepTime.getSeconds());
    const data = { amount: sign * amt, cur: $('#fCur').value, cat: F.cat, desc: $('#fDesc').value.trim(), acc: accId, date, note: $('#fNote').value.trim() };
    if (old) {
      const catChanged = old.cat !== data.cat;
      Object.assign(old, data);
      let n = 0;
      if (catChanged && $('#fRemember')?.checked) {
        const k = merchantKey(old.desc);
        if (k) {
          S.rules[k] = data.cat;
          for (const x of S.tx) if (x !== old && x.src !== 'manual' && merchantKey(x.desc) === k && x.cat !== data.cat) { x.cat = data.cat; n++; }
        }
      }
      toast(n ? t('tx.savedRule', { n }) : t('saved'));
    } else {
      S.tx.push({ id: uid(), src: 'manual', hash: uid(), ...data });
      toast(t('saved'));
    }
    sortTx();
    save();
    closeSheet();
    render();
  },
  txDel: (el) => {
    if (!F.delArm) { F.delArm = true; el.textContent = t('deleteSure'); el.classList.add('armed'); return; }
    S.tx = S.tx.filter((x) => x !== F.tx);
    save(); closeSheet(); render(); toast(t('deleted'));
  },
  more: () => { ui.limit += 100; $('#txList').innerHTML = txList(); },
  ftype: (el) => { ui.ftype = el.dataset.v; render(); },
  clearCat: () => { ui.fcat = ''; render(); },

  period: (el) => { ui.period = el.dataset.v; ui.anchor = Date.now(); ui.chartEnd = Date.now(); render(); },
  kind: (el) => { ui.kind = el.dataset.v; render(); },
  pnav: (el) => { ui.anchor = +addUnit(startOf(ui.anchor, ui.period), ui.period, +el.dataset.d); if (ui.anchor > Date.now()) ui.anchor = Date.now(); render(); },
  pickBar: (el) => { ui.anchor = +el.dataset.key; render(); },
  pickDay: (el) => { ui.tab = 'stats'; ui.period = 'day'; ui.kind = 'exp'; ui.anchor = +el.dataset.key; ui.chartEnd = Date.now(); render(); scrollTo(0, 0); },
  goStats: (el) => { ui.tab = 'stats'; ui.period = 'month'; ui.kind = el.dataset.kind; ui.anchor = Date.now(); ui.chartEnd = Date.now(); render(); scrollTo(0, 0); },
  goStatsTips: () => { ui.tab = 'stats'; render(); setTimeout(() => $('#tips')?.scrollIntoView({ behavior: 'smooth' }), 50); },
  goPlans: (el) => { ui.tab = 'plans'; ui.plans = el.dataset.v; render(); scrollTo(0, 0); },
  openCat: (el) => catSheet(el.dataset.id),
  catToTx: (el) => { ui.fcat = el.dataset.id; ui.tab = 'tx'; ui.q = ''; closeSheet(); render(); scrollTo(0, 0); },
  nwsInfo: () => sheet(t('nws.title'), `<p>${t('nws.info')}</p>`),
  insight: (el) => {
    const a = el.dataset.a;
    if (a === 'newEmergency') {
      goalSheet(null);
      $('#gName').value = t('goal.emergencyName');
      $('#gTarget').value = el.dataset.target;
      F.emoji = '🛡️';
      $('#emojiRow').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === '🛡️'));
    } else { ui.tab = 'plans'; ui.plans = a; render(); scrollTo(0, 0); }
  },

  plans: (el) => { ui.plans = el.dataset.v; render(); },
  goalEdit: (el) => goalSheet(S.goals.find((g) => g.id === el.dataset.id)),
  pickEmoji: (el) => { F.emoji = el.dataset.v; $('#emojiRow').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); },
  goalSave: () => {
    const name = $('#gName').value.trim();
    const target = Imp.parseAmount($('#gTarget').value);
    if (!name) return toast(t('err.name'));
    if (!(target > 0)) return toast(t('err.amount'));
    const dl = $('#gDeadline').value;
    const data = { name, emoji: F.emoji, target, cur: $('#gCur').value, saved: Imp.parseAmount($('#gSaved').value) || 0, deadline: dl ? +new Date(dl + 'T12:00') : null, jarId: $('#gJar')?.value || null };
    if (F.goal) {
      const diff = data.saved - (F.goal.saved || 0);
      if (diff) (F.goal.history ||= []).push({ d: Date.now(), a: diff });
      Object.assign(F.goal, data);
    } else S.goals.push({ id: uid(), created: Date.now(), history: data.saved ? [] : [], ...data });
    save(); closeSheet(); ui.tab = 'plans'; ui.plans = 'goals'; render();
  },
  goalAdd: (el) => goalAddSheet(S.goals.find((g) => g.id === el.dataset.id)),
  goalContrib: (el) => {
    const g = F.goal;
    const v = Imp.parseAmount($('#gAmt').value) * +el.dataset.sign;
    if (!v) return toast(t('err.amount'));
    g.saved = Math.max(0, (g.saved || 0) + v);
    (g.history ||= []).push({ d: Date.now(), a: v });
    const reached = g.saved >= g.target;
    if (reached) g.done = true;
    save(); closeSheet(); render();
    if (reached) celebrate(g); else toast(t('goal.added'));
  },
  goalToggleDone: () => { F.goal.done = !F.goal.done; save(); closeSheet(); render(); if (F.goal.done) celebrate(F.goal); },
  goalDel: () => confirmSheet(t('goal.delQ', { n: esc(F.goal.name) }), t('delete'), () => { S.goals = S.goals.filter((g) => g !== F.goal); save(); render(); }),

  limitEdit: (el) => limitSheet(el.dataset.id),
  limitSave: () => {
    const v = Imp.parseAmount($('#lAmt').value);
    if (!(v > 0)) return toast(t('err.amount'));
    S.limits[F.limitCat] = v;
    save(); closeSheet(); render();
  },
  limitDel: () => { delete S.limits[F.limitCat]; save(); closeSheet(); render(); },
  limitSuggest: () => limitSuggestSheet(),
  limitSuggestApply: () => {
    document.querySelectorAll('[data-sugg]').forEach((cb) => { if (cb.checked) S.limits[cb.dataset.sugg] = F.sugg.find(([id]) => id === cb.dataset.sugg)[1]; });
    save(); closeSheet(); ui.plans = 'limits'; render(); toast(t('saved'));
  },

  subEdit: (el) => subSheet(el.dataset.key),
  subHide: () => { S.subs.hidden.push(F.sub.key); save(); closeSheet(); render(); },
  subSave: () => {
    const name = $('#sName').value.trim();
    const amount = Imp.parseAmount($('#sAmt').value);
    if (!name) return toast(t('err.name'));
    if (!(amount > 0)) return toast(t('err.amount'));
    const data = { name, amount, cur: $('#sCur').value, period: $('#sPer').value, next: +new Date($('#sNext').value + 'T12:00'), cat: 'subs' };
    const ex = F.sub && S.subs.manual.find((m) => m.id === F.sub.id);
    if (ex) Object.assign(ex, data); else S.subs.manual.push({ id: uid(), ...data });
    save(); closeSheet(); render();
  },
  subDel: () => { S.subs.manual = S.subs.manual.filter((m) => m.id !== F.sub.id); save(); closeSheet(); render(); },

  accEdit: (el) => accSheet(el.dataset.id),
  accSave: () => {
    const a = F.acc;
    const name = $('#aName').value.trim();
    if (!name) return toast(t('err.name'));
    if (a?.type === 'mono') {
      Object.assign(a, { name, sync: $('#aSync').checked, include: $('#aInc').checked });
    } else {
      const bRaw = $('#aBal').value.trim();
      const data = { name, type: $('#aType').value, cur: $('#aCur').value, include: $('#aInc').checked };
      const newBal = bRaw === '' ? null : Imp.parseAmount(bRaw);
      if (a) {
        if (newBal !== (a.balance == null ? null : Math.round(accBalance(a) * 100) / 100)) { data.balance = newBal; data.balanceTs = Date.now(); }
        Object.assign(a, data);
      } else S.accounts.push({ id: uid(), ...data, balance: newBal, balanceTs: Date.now() });
    }
    save(); closeSheet(); render();
  },
  accDel: () => {
    const a = F.acc;
    const n = S.tx.filter((x) => x.acc === a.id).length;
    confirmSheet(t('acc.delQ', { a: esc(a.name), n }), t('delete'), () => {
      S.accounts = S.accounts.filter((x) => x !== a);
      S.tx = S.tx.filter((x) => x.acc !== a.id);
      save(); render(); toast(t('deleted'));
    });
  },

  openMono: () => monoSheet(),
  monoConnect: async (el) => {
    const token = $('#mToken').value.trim();
    if (token.length < 20) return toast(t('mono.badToken'));
    el.disabled = true;
    el.textContent = t('mono.checking');
    try {
      const list = await Mono.clientInfo(token);
      monoPickSheet(list);
    } catch (e) {
      el.disabled = false;
      el.textContent = t('mono.connect');
      if (S.mono && !S.accounts.some((a) => a.type === 'mono')) S.mono = null;
      toast(e.code === 403 || e.code === 401 ? t('mono.badToken') : e.code === 429 ? t('mono.rate') : e.message === 'Failed to fetch' ? t('mono.errNet') : e.message);
    }
  },
  monoDepth: (el) => { F.monoDepth = +el.dataset.v; el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el)); },
  monoAdd: () => {
    const pick = [...document.querySelectorAll('[data-mi]')].filter((c) => c.checked).map((c) => F.monoList[+c.dataset.mi]);
    if (!pick.length) return toast(t('mono.pickOne'));
    Mono.addAccounts(pick);
    Mono.syncAll({ fromDays: F.monoDepth || 92 });
    save();
    monoSheet();
    toast(t('mono.started'));
  },
  syncNow: () => { if (!S.mono?.token) return monoSheet(); Mono.syncAll(); toast(t('mono.started')); if ($('#monoProgress')) monoSheet(); },
  monoHistory: (el) => {
    const days = +el.dataset.v;
    for (const a of S.accounts.filter((x) => x.type === 'mono')) a.lastSync = 0;
    Mono.syncAll({ fromDays: days });
    monoSheet();
    toast(t('mono.started'));
  },
  monoRefresh: async () => {
    try {
      toast(t('mono.checking'));
      const list = await Mono.clientInfo(S.mono.token);
      const fresh = list.filter((x) => !S.accounts.some((a) => a.monoId === x.monoId));
      if (fresh.length) monoPickSheet(fresh); else { monoSheet(); toast(t('saved')); }
      render();
    } catch (e) { toast(e.code === 429 ? t('mono.rate') : e.message); }
  },
  monoOff: () => confirmSheet(t('mono.offQ'), t('mono.disconnect'), () => { Mono.disconnect(); render(); }),

  openImport: () => importSheet(),
  impPreset: (el) => { F.imp.preset = el.dataset.v; const p = F.imp.preset; F.imp = { preset: p }; importSheet(); },
  impCommit: () => {
    let a = impAccount();
    if (a.id === '__new') {
      const p = F.imp.preset;
      const cur = F.imp.result.tx[0]?.cur || a.cur;
      a = { id: uid(), type: a.type, name: p === 'other' ? t('acc.other') : Imp.PRESETS[p].name.replace(' (файл)', ''), cur, balance: null, include: true };
      S.accounts.push(a);
      // re-parse with the real account id so hashes match future imports
      F.imp.result = Imp.parseRows(F.imp.rows, F.imp.headerIdx, F.imp.map, { accId: a.id, cur, headers: F.imp.headers });
    }
    Imp.rememberMap(F.imp.preset, F.imp.headers, F.imp.map);
    Imp.commit(F.imp.result.tx, a, F.imp.result.lastBal);
    save();
    closeSheet();
    render();
    toast(F.imp.result.tx.length ? t('imp.done', { n: F.imp.result.tx.length }) : t('imp.balUpdated'));
  },

  ratesSheet: () => {
    const r = S.rates;
    sheet(t('set.rates'), `<p class="muted">${t('rates.src', { s: r.src === 'default' ? t('rates.default') : r.src, d: r.ts ? ago(r.ts) : '—' })}</p>
      ${CURRENCIES.filter((c) => c !== 'UAH').map((c) => `<label class="field"><span>1 ${c} = … UAH</span><input inputmode="decimal" data-rate="${c}" value="${r[c]}"></label>`).join('')}
      <button class="btn primary big" data-action="ratesSave">${t('save')}</button>
      <button class="btn ghost" data-action="ratesRefresh">${icon('sync')} ${t('rates.refresh')}</button>
      <p class="muted small">${t('rates.note')}</p>`);
  },
  ratesSave: () => {
    document.querySelectorAll('[data-rate]').forEach((i) => { const v = Imp.parseAmount(i.value); if (v > 0) S.rates[i.dataset.rate] = v; });
    S.rates.src = t('rates.manual'); S.rates.ts = Date.now();
    save(); closeSheet(); render();
  },
  ratesRefresh: async () => { const ok = await refreshRates(true); toast(ok ? t('rates.ok') : t('rates.fail')); closeSheet(); render(); },

  catsSheet: () => catsSheet(),
  catEdit: (el) => catEditSheet(el.dataset.id),
  catSave: () => {
    const name = $('#cName').value.trim();
    if (!name) return toast(t('err.name'));
    const data = { emoji: F.emoji, kind: $('#cKind').value, group: $('#cGroup').value };
    if (F.catEdit) {
      if (name !== catName(F.catEdit)) F.catEdit.name = name;
      Object.assign(F.catEdit, data);
    } else S.cats.push({ id: 'c_' + uid(), name, ...data });
    save(); render(); catsSheet();
  },
  catHide: () => { F.catEdit.hidden = !F.catEdit.hidden; save(); catsSheet(); },
  rulesReset: () => { S.rules = {}; save(); catsSheet(); toast(t('saved')); },

  pinSheet: () => pinSheet(),
  pinSet: () => {
    pinEntrySheet(t('pin.new'), (p1) => {
      pinEntrySheet(t('pin.repeat'), async (p2) => {
        if (p1 !== p2) return pinError(t('pin.mismatch'));
        await setPin(p1);
        F.pinOn = true;
        closeSheet(); render(); toast(t('pin.enabled'));
      });
    });
  },
  pinChange: () => {
    pinEntrySheet(t('pin.current'), async (p0) => {
      if (!(await checkPin(p0))) return pinError(t('lock.wrong'));
      A.pinSet();
    });
  },
  pinOff: () => {
    pinEntrySheet(t('pin.current'), async (p0) => {
      if (!(await checkPin(p0))) return pinError(t('lock.wrong'));
      await setPin(null);
      F.pinOn = false;
      closeSheet(); render(); toast(t('pin.disabled'));
    });
  },

  backup: () => {
    download(`budget-backup-${isoDate(Date.now())}.json`, JSON.stringify({ app: 'budget-planner', v: 1, data: S }, null, 0), 'application/json');
    S.lastBackup = Date.now();
    save();
  },
  exportCsv: () => {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['date', 'account', 'category', 'description', 'amount', 'currency', `amount_${S.base}`, 'note'].join(',')];
    for (const x of S.tx) lines.push([isoDate(x.date), q(acc(x.acc)?.name), q(catName(x.cat)), q(x.desc), x.amount, x.cur, toBase(x.amount, x.cur).toFixed(2), q(x.note)].join(','));
    download(`budget-${isoDate(Date.now())}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  },
  installSheet: () => sheet(t('set.install'), t('install.html')),
  wipe: () => confirmSheet(t('wipe.q'), t('wipe.ok'), async () => { Mono.cancel(); await wipeAll(); F = {}; location.reload(); }),
};

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function celebrate(g) {
  sheet('🎉', `<div class="celebrate"><div class="em-big">${g.emoji || '🎯'}</div><h2>${t('goal.congrats')}</h2><p>${t('goal.congratsText', { n: esc(g.name), v: fmt(g.target, g.cur) })}</p><button class="btn primary big" data-action="closeSheet">${t('goal.yay')}</button></div>`);
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.animationDelay = Math.random() * 0.6 + 's';
    s.style.background = ['#1f8a70', '#eda100', '#e87ba4', '#2a78d6', '#eb6834'][i % 5];
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

/* ================= events ================= */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el, e);
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    ui.q = e.target.value;
    ui.limit = 80;
    $('#txList').innerHTML = txList();
  }
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'facc') { ui.facc = el.value; $('#txList').innerHTML = txList(); }
  else if (el.id === 'impFile' && el.files[0]) onImportFile(el.files[0]);
  else if (el.dataset.map) { F.imp.map[el.dataset.map] = +el.value; importMapSheet(); }
  else if (el.id === 'impInvert') { F.imp.map.invert = el.checked; importMapSheet(); }
  else if (el.id === 'restoreFile' && el.files[0]) {
    try {
      const j = JSON.parse(await el.files[0].text());
      if (!j.data || !Array.isArray(j.data.tx)) throw new Error('format');
      confirmSheet(t('restore.q', { n: j.data.tx.length }), t('restore.ok'), () => { setState(j.data); save(); applyTheme(S.theme); render(); toast(t('restore.done')); }, false);
    } catch { toast(t('restore.err')); }
    el.value = '';
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  if ($('#app').dataset.view === 'lock' && /^[0-9]$/.test(e.key)) A.pinKey({ dataset: { k: e.key } });
  if ($('#app').dataset.view === 'lock' && e.key === 'Backspace') A.pinKey({ dataset: { k: 'del' } });
});
let rT;
window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => $('#app').dataset.view === 'main' && renderMain(), 200); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(S.theme));

getMeta().then((m) => { F.pinOn = !!m.pin; });
boot();
