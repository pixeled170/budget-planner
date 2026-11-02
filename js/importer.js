// Bank statement import: CSV / XLSX parsing, header detection, column mapping, de-duplication.
import { S, uid, CURRENCIES, sortTx } from './store.js';
import { categorize, merchantKey } from './cats.js';

export const PRESETS = {
  privat: { name: 'Privat24', enc: 'windows-1251', cur: 'UAH', emoji: '🟩' },
  pekao: { name: 'Bank Pekao', enc: 'windows-1250', cur: 'PLN', emoji: '🟥' },
  revolut: { name: 'Revolut', enc: 'utf-8', cur: 'EUR', emoji: '⬛' },
  monofile: { name: 'Monobank (файл)', enc: 'utf-8', cur: 'UAH', emoji: '🐱' },
  other: { name: 'Other', enc: 'windows-1251', cur: 'UAH', emoji: '🏦' },
};

export const FIELDS = {
  date: ['дата і час', 'дата i час', 'дата операції', 'дата операции', 'дата', 'date', 'data operacji', 'data transakcji', 'data księgowania', 'data'],
  time: ['час', 'время', 'time', 'godzina'],
  desc: ['деталі операції', 'опис операції', 'описание операции', 'опис', 'описание', 'призначення', 'назначение', 'description', 'details', 'opis operacji', 'opis', 'tytułem', 'tytuł', 'merchant', 'payee', 'назва'],
  desc2: ['nadawca / odbiorca', 'nadawca/odbiorca', 'odbiorca', 'nadawca', 'контрагент', 'counterparty'],
  amount: ['сума в валюті картки', 'сумма в валюте карты', 'сума операції', 'сумма операции', 'сума', 'сумма', 'amount', 'kwota operacji', 'kwota transakcji', 'kwota', 'value'],
  currency: ['валюта картки', 'валюта карты', 'валюта', 'currency', 'waluta'],
  category: ['категорія', 'категория', 'category', 'kategoria'],
  mcc: ['mcc'],
  state: ['state', 'status', 'статус', 'stan'],
  type: ['тип операції', 'тип операции', 'type', 'typ operacji', 'typ transakcji', 'rodzaj'],
  fee: ['fee', 'сума комісій', 'комісія', 'комиссия', 'prowizja'],
};
const OPTIONAL_AUTO = { fee: ['revolut'] };

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/* ---------- reading ---------- */
const libs = {};
function loadScript(src, name) {
  if (window[name]) return Promise.resolve(window[name]);
  if (!libs[src])
    libs[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res(window[name]);
      s.onerror = () => {
        delete libs[src];
        rej(new Error('lib-load'));
      };
      document.head.appendChild(s);
    });
  return libs[src];
}
const loadXLSX = () => loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX');
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
async function loadPDFJS() {
  const lib = await loadScript(PDFJS + 'pdf.min.js', 'pdfjsLib');
  lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  return lib;
}

function decodeText(buf, preset) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder(PRESETS[preset]?.enc || 'windows-1251').decode(buf);
  }
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const sample = text.split(/\r?\n/).slice(0, 15).join('\n');
  const delims = [';', ',', '\t', '|'];
  const counts = delims.map((d) => sample.split(d).length);
  const delim = delims[counts.indexOf(Math.max(...counts))];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

export async function readTable(file, preset) {
  const buf = await file.arrayBuffer();
  if (String.fromCharCode(...new Uint8Array(buf.slice(0, 5))) === '%PDF-') return pdfToRows(buf);
  const isXlsx = /\.(xlsx|xls|xlsm)$/i.test(file.name) || new Uint8Array(buf.slice(0, 2)).join() === '80,75';
  if (isXlsx) {
    const XLSX = await loadXLSX();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    // pick the sheet with the most rows
    let best = [];
    for (const n of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
      if (rows.length > best.length) best = rows;
    }
    return best.filter((r) => r.some((c) => String(c).trim() !== ''));
  }
  return parseCSV(decodeText(buf, preset));
}

/* ---------- PDF ---------- */
// Text lines of all pages, top to bottom: [{page, y, items: [{s, x, w}]}]
async function pdfLines(buf) {
  const pdfjs = await loadPDFJS();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const items = tc.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ s: i.str.replace(/\s+/g, ' ').trim(), x: i.transform[4], y: i.transform[5], w: i.width }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let cur = null;
    for (const it of items) {
      if (cur && Math.abs(cur.y - it.y) <= 3) cur.items.push(it);
      else out.push((cur = { page: p, y: it.y, items: [it] }));
    }
  }
  for (const l of out) l.items.sort((a, b) => a.x - b.x);
  return out;
}

const DATE_START = /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2})/;
const TIME = /^\d{1,2}:\d{2}(:\d{2})?$/;
const MONEY = /^[-−+]?\d{1,3}(?:[ \u00a0]?\d{3})*[.,]\d{2}(?:\s?[A-ZА-ЯІЄ₴$€zł]{1,3})?$/i;

function headerHits(line) {
  return line.items.filter((it) => {
    const h = norm(it.s);
    return h.length < 40 && Object.values(FIELDS).some((ks) => ks.some((k) => h.includes(k)));
  }).length;
}

// Rebuilds the statement table from PDF text using the header's column positions.
export async function pdfToRows(buf) {
  const lines = await pdfLines(buf);
  const hi = lines.findIndex((l) => headerHits(l) >= 2);
  if (hi < 0) return pdfFallback(lines);
  // header cells: merge words that sit close together
  const cols = [];
  for (const it of lines[hi].items) {
    const last = cols[cols.length - 1];
    if (last && it.x - last.end < 4) { last.text.push(it.s); last.end = it.x + it.w; }
    else cols.push({ x: it.x, end: it.x + it.w, text: [it.s] });
  }
  const colOf = (it) => {
    const c = it.x + it.w / 2;
    let k = 0;
    for (let i = 0; i < cols.length; i++) if (c >= cols[i].x - 6) k = i;
    return k;
  };
  const dateCol = Math.max(0, cols.findIndex((c) => /дата|date|data/i.test(c.text.join(' '))));
  const isData = (l) => DATE_START.test(l.items[0].s) && colOf(l.items[0]) <= dateCol;
  const rows = [];
  let row = null, rowLine = null, inHeader = true, headerDone = false;
  for (let i = hi + 1; i < lines.length; i++) {
    const l = lines[i];
    if (headerHits(l) >= 2) { row = null; inHeader = true; continue; } // header repeated on a new page
    if (isData(l)) {
      inHeader = false;
      headerDone = true;
      row = cols.map(() => []);
      rows.push(row);
      rowLine = l;
      for (const it of l.items) row[colOf(it)].push(it.s);
    } else if (inHeader) {
      if (!headerDone) for (const it of l.items) cols[colOf(it)].text.push(it.s); // header wrapped onto several lines
    } else if (row && l.page === rowLine.page && rowLine.y - l.y < 30) {
      // wrapped description; numbers here are usually totals, not part of the row
      for (const it of l.items) if (!MONEY.test(it.s)) row[colOf(it)].push(it.s);
      rowLine = l;
    } else row = null;
  }
  if (!rows.length) return pdfFallback(lines);
  return [cols.map((c) => c.text.join(' ')), ...rows.map((r) => r.map((c) => c.join(' ')))];
}

// No recognizable header: take each line that starts with a date, its first money amount and the rest as description.
function pdfFallback(lines) {
  const rows = [['Дата', 'Опис', 'Сума']];
  for (const l of lines) {
    const t = l.items.map((i) => i.s);
    if (!DATE_START.test(t[0])) continue;
    let date = t[0], k = 1;
    if (TIME.test(t[1] || '')) { date += ' ' + t[1]; k = 2; }
    const rest = t.slice(k);
    const amount = rest.find((s) => MONEY.test(s));
    if (!amount) continue;
    const desc = rest.filter((s) => !MONEY.test(s) && !/^(UAH|USD|EUR|PLN|грн)$/i.test(s) && !TIME.test(s)).join(' ');
    rows.push([date, desc, amount]);
  }
  return rows;
}

/* ---------- detection ---------- */
function findHeader(rows) {
  let best = 0, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    let score = 0;
    for (const c of rows[i]) {
      const h = norm(c);
      if (!h || h.length > 60) continue;
      if (Object.values(FIELDS).some((ks) => ks.some((k) => h.includes(k)))) score++;
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 2 ? best : -1;
}

export function detect(rows, preset) {
  const headerIdx = findHeader(rows);
  const headers = headerIdx >= 0 ? rows[headerIdx].map((h) => String(h ?? '').trim()) : rows[0].map((_, i) => `#${i + 1}`);
  const saved = S.importMaps[preset];
  if (saved && saved.sig === headers.join('|')) return { headerIdx, headers, map: { ...saved.map } };
  const used = new Set();
  const map = {};
  const nh = headers.map(norm);
  for (const [field, keys] of Object.entries(FIELDS)) {
    if (OPTIONAL_AUTO[field] && !OPTIONAL_AUTO[field].includes(preset)) { map[field] = -1; continue; }
    map[field] = -1;
    outer: for (const k of keys) {
      for (let i = 0; i < nh.length; i++) {
        if (used.has(i)) continue;
        const h = nh[i];
        // "time" must be a column on its own, not a part of "дата і час"
        if (field === 'time' ? h === k : h.includes(k)) { map[field] = i; used.add(i); break outer; }
      }
    }
  }
  map.invert = false;
  return { headerIdx, headers, map };
}

export function rememberMap(preset, headers, map) {
  S.importMaps[preset] = { sig: headers.join('|'), map };
}

/* ---------- value parsing ---------- */
export function parseAmount(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[\s  ']/g, '').replace(/[^\d,.\-−()+]/g, '');
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^[-−]/.test(s) || /[-−]$/.test(s)) neg = true;
  s = s.replace(/[-−+]/g, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) {
    if (lc > ld) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lc >= 0) {
    const after = s.length - lc - 1;
    s = after === 3 && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(/,/g, after <= 2 ? '.' : '');
  }
  const n = parseFloat(s);
  return neg ? -n : n;
}

export function parseDate(v, timeV) {
  let d = null;
  if (v instanceof Date) d = new Date(v);
  else if (typeof v === 'number' && v > 20000 && v < 80000) d = new Date(Math.round((v - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4);
  else {
    const s = String(v ?? '').trim();
    let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
    else if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
      const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      d = new Date(y, +m[2] - 1, +m[1], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
    }
  }
  if (!d || isNaN(d)) return NaN;
  if (timeV !== undefined && timeV !== '') {
    const tm = timeV instanceof Date ? [timeV.getHours(), timeV.getMinutes()] : String(timeV).match(/(\d{1,2}):(\d{2})/)?.slice(1).map(Number);
    if (tm) d.setHours(tm[0], tm[1], 0, 0);
  }
  return +d;
}

const SKIP_STATE = /(declin|revert|fail|cancel|odrzuc|anulow|відхил|скасов|отклон|отмен)/i;

export function hashOf(accId, date, amount, desc) {
  return `${accId}|${Math.round(date / 60000)}|${amount.toFixed(2)}|${merchantKey(desc)}`;
}

export function parseRows(rows, headerIdx, map, { accId, cur, headers }) {
  const fixedCur = (headers?.[map.amount] || '').match(/\((UAH|USD|EUR|PLN)\)/i)?.[1]?.toUpperCase();
  const existing = new Set(S.tx.filter((x) => x.acc === accId).map((x) => x.hash));
  const seen = new Map();
  const out = [];
  let dups = 0, bad = 0;
  const get = (r, f) => (map[f] >= 0 ? r[map[f]] : '');
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (map.state >= 0 && SKIP_STATE.test(String(get(r, 'state')))) continue;
    const date = parseDate(get(r, 'date'), map.time >= 0 ? get(r, 'time') : undefined);
    let amount = parseAmount(get(r, 'amount'));
    if (isNaN(date) || isNaN(amount) || amount === 0) { bad++; continue; }
    if (map.fee >= 0) {
      const fee = parseAmount(get(r, 'fee'));
      if (fee) amount -= Math.abs(fee);
    }
    if (map.invert) amount = -amount;
    const d1 = String(get(r, 'desc') ?? '').trim();
    const d2 = String(get(r, 'desc2') ?? '').trim();
    const desc = [d2, d1].filter(Boolean).join(' · ') || String(get(r, 'type') ?? '');
    let c = (fixedCur || String(get(r, 'currency') ?? '').trim().toUpperCase() || cur).slice(0, 3);
    if (c === 'ГРН' || c === 'ZŁ' || c === 'ZL') c = c === 'ГРН' ? 'UAH' : 'PLN';
    if (!CURRENCIES.includes(c)) c = cur;
    const mcc = parseInt(get(r, 'mcc')) || 0;
    const bankCat = `${get(r, 'category') ?? ''} ${get(r, 'type') ?? ''}`.trim();
    let h = hashOf(accId, date, amount, desc);
    const n = (seen.get(h) || 0) + 1;
    seen.set(h, n);
    if (n > 1) h += '#' + n;
    if (existing.has(h)) { dups++; continue; }
    out.push({ id: uid(), acc: accId, date, amount: Math.round(amount * 100) / 100, cur: c, desc, mcc, bankCat, cat: categorize({ desc, mcc, amount, bankCat }, S.rules), src: 'import', hash: h });
  }
  out.sort((a, b) => b.date - a.date);
  return { tx: out, dups, bad };
}

export function commit(list) {
  for (const x of list) {
    delete x.bankCat;
    S.tx.push(x);
  }
  sortTx();
}
