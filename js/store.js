// State, persistence (IndexedDB, optional AES-GCM encryption by PIN), currencies, date helpers.
import { DEFAULT_CATS } from './cats.js';

export const CURRENCIES = ['UAH', 'USD', 'EUR', 'PLN'];
export const CUR_SYM = { UAH: '₴', USD: '$', EUR: '€', PLN: 'zł' };
export const ISO_NUM = { 980: 'UAH', 840: 'USD', 978: 'EUR', 985: 'PLN' };

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function defaults() {
  const nav = (navigator.language || 'en').toLowerCase();
  return {
    v: 1,
    onboarded: false,
    lang: nav.startsWith('ru') || nav.startsWith('uk') ? 'ru' : 'en',
    base: 'UAH',
    theme: 'auto',
    accounts: [],
    tx: [],
    cats: DEFAULT_CATS.map((c) => ({ ...c })),
    rules: {},
    goals: [],
    limits: {},
    subs: { hidden: [], manual: [] },
    rates: { UAH: 1, USD: 45.6, EUR: 51.0, PLN: 12.0, ts: 0, src: 'default' },
    mono: null,
    importMaps: {},
    demo: false,
    settings: { autoLockMin: 1 },
  };
}

export let S = defaults();
export function setState(s) {
  S = migrate(s);
}

function migrate(s) {
  const d = defaults();
  const out = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) }, subs: { ...d.subs, ...(s.subs || {}) } };
  // add any new default categories the stored state doesn't have yet
  for (const c of DEFAULT_CATS) if (!out.cats.find((x) => x.id === c.id)) out.cats.push({ ...c });
  return out;
}

/* ---------- IndexedDB key-value ---------- */
let dbp = null;
function db() {
  if (!dbp)
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('budget-planner', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  return dbp;
}
export async function kvGet(k) {
  const d = await db();
  return new Promise((res, rej) => {
    const q = d.transaction('kv').objectStore('kv').get(k);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
export async function kvSet(k, v) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('kv', 'readwrite');
    t.objectStore('kv').put(v, k);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

/* ---------- crypto ---------- */
const enc = new TextEncoder();
const dec = new TextDecoder();
let cryptoKey = null; // set while unlocked with a PIN

async function deriveKey(pin, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// meta lives unencrypted: { pin: bool, salt, lang, theme }
export async function getMeta() {
  return (await kvGet('meta')) || { pin: false };
}

export async function loadPlain() {
  const raw = await kvGet('data');
  return raw && !raw.ct ? raw : null;
}

export async function unlock(pin) {
  const meta = await getMeta();
  const key = await deriveKey(pin, meta.salt);
  const raw = await kvGet('data');
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.iv }, key, raw.ct);
    cryptoKey = key;
    setState(JSON.parse(dec.decode(pt)));
    return true;
  } catch {
    return false;
  }
}

export async function setPin(pin) {
  const meta = await getMeta();
  if (pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    cryptoKey = await deriveKey(pin, salt);
    await kvSet('meta', { ...meta, pin: true, salt });
  } else {
    cryptoKey = null;
    await kvSet('meta', { ...meta, pin: false, salt: null });
  }
  await saveNow();
}

export async function checkPin(pin) {
  const meta = await getMeta();
  if (!meta.pin) return true;
  const key = await deriveKey(pin, meta.salt);
  const raw = await kvGet('data');
  try {
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.iv }, key, raw.ct);
    return true;
  } catch {
    return false;
  }
}

export function lockNow() {
  cryptoKey = null;
  S = defaults();
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
export async function saveNow() {
  clearTimeout(saveTimer);
  const meta = await getMeta();
  await kvSet('meta', { ...meta, lang: S.lang, theme: S.theme });
  if (meta.pin) {
    if (!cryptoKey) return; // locked, nothing to save
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(JSON.stringify(S)));
    await kvSet('data', { iv, ct });
  } else {
    await kvSet('data', S);
  }
}

export async function wipeAll() {
  cryptoKey = null;
  await kvSet('data', null);
  await kvSet('meta', { pin: false });
  S = defaults();
}

/* ---------- money ---------- */
export function toBase(amount, cur) {
  const r = S.rates;
  return (amount * (r[cur] || 1)) / (r[S.base] || 1);
}
export function convert(amount, from, to) {
  const r = S.rates;
  return (amount * (r[from] || 1)) / (r[to] || 1);
}

export function fmtNum(n, frac = 0) {
  const loc = S.lang === 'ru' ? 'ru-RU' : 'en-US';
  return new Intl.NumberFormat(loc, { minimumFractionDigits: frac, maximumFractionDigits: frac }).format(n);
}

export function fmt(n, cur = S.base, { sign = false, frac } = {}) {
  const abs = Math.abs(n);
  const f = frac ?? (abs % 1 && (abs < 10 || (abs < 100 && cur !== 'UAH')) ? 2 : 0);
  const s = fmtNum(abs, f);
  const pre = n < 0 ? '−' : sign && n > 0 ? '+' : '';
  return cur === 'USD' ? `${pre}$${s}` : `${pre}${s} ${CUR_SYM[cur] || cur}`;
}

export function fmtCompact(n, cur = S.base) {
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e6) s = fmtNum(abs / 1e6, abs >= 1e7 ? 0 : 1) + (S.lang === 'ru' ? ' млн' : 'M');
  else if (abs >= 1e4) s = fmtNum(abs / 1e3, 0) + (S.lang === 'ru' ? 'к' : 'K');
  else if (abs >= 1e3) s = fmtNum(abs / 1e3, abs % 1000 < 50 ? 0 : 1) + (S.lang === 'ru' ? 'к' : 'K');
  else s = fmtNum(abs, 0);
  const pre = n < 0 ? '−' : '';
  return cur === 'USD' ? `${pre}$${s}` : `${pre}${s} ${CUR_SYM[cur] || cur}`;
}

export async function refreshRates(force = false) {
  if (!force && Date.now() - (S.rates.ts || 0) < 6 * 3600e3) return false;
  try {
    const r = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
    const list = await r.json();
    const rates = { UAH: 1 };
    for (const x of list) if (CURRENCIES.includes(x.cc)) rates[x.cc] = x.rate;
    if (CURRENCIES.every((c) => rates[c])) {
      S.rates = { ...rates, ts: Date.now(), src: 'NBU' };
      save();
      return true;
    }
  } catch {}
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/UAH');
    const j = await r.json();
    const rates = { UAH: 1 };
    for (const c of CURRENCIES) if (j.rates?.[c]) rates[c] = 1 / j.rates[c];
    S.rates = { ...rates, ts: Date.now(), src: 'ER-API' };
    save();
    return true;
  } catch {}
  return false;
}

/* ---------- categories & tx ---------- */
export const cat = (id) => S.cats.find((c) => c.id === id) || S.cats.find((c) => c.id === 'other_exp');
export const catName = (c) => (typeof c === 'string' ? catName(cat(c)) : c.name || c[S.lang] || c.ru || c.en);
export const acc = (id) => S.accounts.find((a) => a.id === id);

export function sortTx() {
  S.tx.sort((a, b) => b.date - a.date);
}

// signed value of tx in base currency, from a spending point of view
export function txBase(t) {
  return toBase(t.amount, t.cur);
}

/* ---------- dates ---------- */
export const DAY = 86400e3;
export function startOf(d, unit) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  if (unit === 'week') {
    const wd = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - wd);
  } else if (unit === 'month') x.setDate(1);
  else if (unit === 'year') x.setMonth(0, 1);
  return x;
}
export function addUnit(d, unit, n) {
  const x = new Date(d);
  if (unit === 'day') x.setDate(x.getDate() + n);
  else if (unit === 'week') x.setDate(x.getDate() + 7 * n);
  else if (unit === 'month') x.setMonth(x.getMonth() + n);
  else if (unit === 'year') x.setFullYear(x.getFullYear() + n);
  return x;
}
export const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
export const locale = () => (S.lang === 'ru' ? 'ru-RU' : 'en-GB');
export function fmtDate(d, opts = { day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat(locale(), opts).format(new Date(d));
}
export function isoDate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
