// Monobank personal API: https://api.monobank.ua/docs/
// Limits: 1 request per 60 s, statement window <= 31 days + 1 hour, max 500 items per response.
import { S, save, uid, ISO_NUM, sortTx, DAY } from './store.js';
import { categorize } from './cats.js';

const API = 'https://api.monobank.ua';
const GAP = 61000;
const WINDOW = 31 * DAY;

export const sync = { running: false, total: 0, done: 0, nextAt: 0, error: null, added: 0 };
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(sync));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let queue = [];

async function call(path, token) {
  const wait = (S.mono?.lastReq || 0) + GAP - Date.now();
  if (wait > 0) {
    sync.nextAt = Date.now() + wait;
    emit();
    await sleep(wait);
  }
  sync.nextAt = 0;
  if (S.mono) S.mono.lastReq = Date.now();
  const r = await fetch(API + path, { headers: { 'X-Token': token } });
  if (r.status === 429) throw Object.assign(new Error('rate'), { code: 429 });
  if (!r.ok) {
    let msg = '';
    try { msg = (await r.json()).errorDescription; } catch {}
    throw Object.assign(new Error(msg || 'HTTP ' + r.status), { code: r.status });
  }
  return r.json();
}

const TYPE_NAME = { black: 'Чорна', white: 'Біла', platinum: 'Platinum', iron: 'Iron', fop: 'ФОП', yellow: 'Дитяча', eAid: 'єПідтримка', madeInUkraine: 'Зроблено в Україні' };

// Fetches client info; returns the list of supported accounts (not yet added) and stores jars.
export async function clientInfo(token) {
  if (!S.mono) S.mono = { token, lastReq: 0, jars: [], name: '' };
  const info = await call('/personal/client-info', token);
  S.mono.token = token;
  S.mono.name = info.name || '';
  S.mono.jars = (info.jars || [])
    .filter((j) => ISO_NUM[j.currencyCode])
    .map((j) => ({ id: j.id, title: j.title, cur: ISO_NUM[j.currencyCode], balance: j.balance / 100, goal: j.goal ? j.goal / 100 : 0 }));
  const accounts = (info.accounts || [])
    .filter((a) => ISO_NUM[a.currencyCode])
    .map((a) => ({
      monoId: a.id,
      cur: ISO_NUM[a.currencyCode],
      name: `Mono ${TYPE_NAME[a.type] || a.type} ${ISO_NUM[a.currencyCode]}${a.maskedPan?.[0] ? ' ·' + a.maskedPan[0].slice(-4) : ''}`,
      balance: (a.balance - (a.creditLimit || 0)) / 100,
      creditLimit: (a.creditLimit || 0) / 100,
    }));
  // refresh balances of accounts already added
  for (const x of accounts) {
    const ex = S.accounts.find((a) => a.monoId === x.monoId);
    if (ex) { ex.balance = x.balance; ex.creditLimit = x.creditLimit; ex.balanceTs = Date.now(); }
  }
  save();
  return accounts;
}

export function addAccounts(list) {
  for (const x of list) {
    if (S.accounts.find((a) => a.monoId === x.monoId)) continue;
    S.accounts.push({ id: uid(), type: 'mono', name: x.name, cur: x.cur, monoId: x.monoId, balance: x.balance, creditLimit: x.creditLimit, balanceTs: Date.now(), include: true, sync: true, lastSync: 0 });
  }
  save();
}

// Queue statement requests for all syncing mono accounts, newest window first.
export function syncAll({ fromDays } = {}) {
  if (!S.mono?.token) return;
  const now = Date.now();
  const jobs = [];
  for (const a of S.accounts.filter((a) => a.type === 'mono' && a.sync !== false)) {
    const from = a.lastSync ? a.lastSync - DAY : now - (fromDays || 31) * DAY;
    for (let to = now; to > from; to -= WINDOW) jobs.push({ accId: a.id, monoId: a.monoId, from: Math.max(from, to - WINDOW), to, last: to === now });
  }
  if (!jobs.length) return;
  queue = queue.concat(jobs.filter((j) => !queue.some((q) => q.accId === j.accId && q.from === j.from)));
  sync.total = sync.done + queue.length;
  sync.error = null;
  if (!sync.running) run();
}

export function cancel() {
  queue = [];
  sync.total = sync.done;
  emit();
}

async function run() {
  sync.running = true;
  emit();
  while (queue.length) {
    const job = queue[0];
    try {
      const list = await call(`/personal/statement/${job.monoId}/${Math.floor(job.from / 1000)}/${Math.floor(job.to / 1000)}`, S.mono.token);
      const a = S.accounts.find((x) => x.id === job.accId);
      if (a) sync.added += ingest(a, list);
      if (list.length >= 500) {
        job.to = list[list.length - 1].time * 1000 - 1000; // fetch the rest of the window
      } else {
        queue.shift();
        sync.done++;
        if (a && job.last) a.lastSync = job.to;
      }
      save();
    } catch (e) {
      if (e.code === 429) continue;
      sync.error = e.message === 'Failed to fetch' ? 'network' : e.message;
      if (e.code === 401 || e.code === 403) { queue = []; break; }
      queue.shift();
      sync.done++;
    }
    emit();
  }
  sync.running = false;
  sync.total = sync.done = 0;
  emit();
}

function ingest(a, list) {
  const have = new Set(S.tx.filter((x) => x.acc === a.id).map((x) => x.id));
  let added = 0;
  for (const it of list) {
    const id = 'mono:' + it.id;
    const amount = it.amount / 100;
    if (!have.has(id)) {
      const desc = [it.description, it.comment].filter(Boolean).join(' — ').replace(/\n/g, ' ');
      S.tx.push({ id, acc: a.id, date: it.time * 1000, amount, cur: a.cur, desc, mcc: it.mcc || 0, cat: categorize({ desc, mcc: it.mcc, amount }, S.rules), src: 'mono', hash: id });
      added++;
    }
    if (it.time * 1000 > (a.balanceTs || 0)) {
      a.balance = it.balance / 100 - (a.creditLimit || 0);
      a.balanceTs = it.time * 1000;
    }
  }
  sortTx();
  return added;
}

export function disconnect() {
  cancel();
  S.mono = null;
  for (const a of S.accounts) if (a.type === 'mono') a.sync = false;
  save();
}
