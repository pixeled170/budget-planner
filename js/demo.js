// Demo data so the app can be explored before connecting real banks.
import { S, uid, sortTx, DAY, startOf, addUnit } from './store.js';
import { categorize } from './cats.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function loadDemo() {
  clearDemo();
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const between = (a, b) => Math.round(a + r() * (b - a));
  const now = Date.now();
  const mono = { id: uid(), type: 'cash', name: 'Monobank (демо)', cur: 'UAH', balance: 38450, balanceTs: now, include: true, demo: true };
  const pekao = { id: uid(), type: 'cash', name: 'Bank Pekao (демо)', cur: 'PLN', balance: 2140, balanceTs: now, include: true, demo: true };
  const cash = { id: uid(), type: 'cash', name: 'Наличные (демо)', cur: 'UAH', balance: 3200, balanceTs: now, include: true, demo: true };
  S.accounts.push(mono, pekao, cash);
  const tx = [];
  const add = (acc, date, amount, desc, mcc = 0) => {
    tx.push({ id: uid(), acc: acc.id, date, amount, cur: acc.cur, desc, mcc, cat: categorize({ desc, mcc, amount }, S.rules), src: 'demo', demo: true, hash: uid() });
  };
  const start = +addUnit(startOf(now, 'month'), 'month', -5);
  for (let d = start; d < now; d += DAY) {
    const day = new Date(d);
    const dom = day.getDate();
    const wd = day.getDay();
    const weekend = wd === 0 || wd === 6;
    const at = (h) => d + h * 3600e3 + between(0, 50) * 60e3;
    const recent = now - d < 25 * DAY; // this month a bit more cafes & delivery, to show insights
    if (dom === 5) add(mono, at(10), 68000, 'Зарплата ТОВ «Софтсерв»');
    if (dom === 20 && r() > 0.3) add(mono, at(15), between(6000, 14000), 'Payoneer — фриланс');
    if (dom === 1) add(mono, at(9), -14000, 'Оренда квартири');
    if (dom === 12) add(mono, at(18), -between(1800, 3100), 'Комунальні послуги YASNO', 4900);
    if (dom === 3) add(mono, at(8), -250, 'Kyivstar', 4814);
    if (dom === 8) add(mono, at(3), -299, 'Netflix.com', 5815);
    if (dom === 14) add(mono, at(3), -199, 'Spotify', 5815);
    if (dom === 18) add(mono, at(3), -880, 'OpenAI ChatGPT', 5817);
    if (dom === 2) add(mono, at(19), -950, 'Sportlife абонемент', 7997);
    if (dom === 5) add(mono, at(12), -10000, 'На банку «Машина»');
    if (r() < 0.38) add(mono, at(between(9, 20)), -between(250, 1250), pick(['Сільпо', 'АТБ', 'Novus', 'Фора']), 5411);
    if (r() < (recent ? 0.55 : 0.35)) add(mono, at(between(8, 21)), -between(90, 480), pick(['Aroma Kava', 'Lviv Croissants', 'Пузата Хата', 'Starbucks', 'Sushi Master']), 5814);
    if (r() < (recent ? 0.3 : 0.14)) add(mono, at(20), -between(280, 650), pick(['Glovo', 'Bolt Food']), 5814);
    if (!weekend && r() < 0.7) add(mono, at(8), -between(30, 140), pick(['Uklon', 'Bolt', 'Київ Цифровий метро']), 4121);
    if (r() < 0.07) add(mono, at(17), -between(1400, 2100), pick(['OKKO АЗС', 'WOG']), 5542);
    if (r() < 0.06) add(mono, at(14), -between(600, 3500), pick(['Rozetka', 'Allegro', 'Епіцентр']), 5311);
    if (r() < 0.025) add(mono, at(16), -between(1200, 4200), pick(['Zara', 'Intertop', 'Answear']), 5651);
    if (r() < 0.05) add(mono, at(12), -between(150, 900), pick(['Аптека Доброго Дня', 'Аптека АНЦ']), 5912);
    if (weekend && r() < 0.35) add(mono, at(19), -between(250, 1300), pick(['Планета Кіно', 'Steam', 'Бар «Барвінок»', 'Concert.ua']));
    if (r() < 0.12) add(mono, at(13), -between(25, 120), pick(['Кава з собою', 'Вода', 'Snack']), 5499);
    if (r() < 0.1) add(cash, at(11), -between(40, 300), pick(['Ринок', 'Кава', 'Квіти']));
    if (r() < 0.18) add(pekao, at(between(10, 20)), -between(15, 140), pick(['Biedronka', 'Żabka', 'Lidl']), 5411);
    if (r() < 0.04) add(pekao, at(17), -between(180, 320), 'Orlen', 5541);
    if (r() < 0.03) add(mono, at(12), Math.round(between(50, 300)), 'Кешбек');
  }
  // demo spike in the last days to trigger the "large purchase" tip
  add(mono, now - 2 * DAY, -6499, 'Comfy — навушники', 5732);
  S.tx.push(...tx.filter((x) => x.date <= now));
  sortTx();
  const y = new Date().getFullYear();
  S.goals.push(
    { id: uid(), name: 'Toyota RAV4', emoji: '🚗', target: 25000, cur: 'USD', saved: 6200, deadline: +new Date(y + 1, 11, 1), created: start, history: [{ d: now - 70 * DAY, a: 450 }, { d: now - 40 * DAY, a: 500 }, { d: now - 10 * DAY, a: 520 }], demo: true },
    { id: uid(), name: 'Отпуск в Италии', emoji: '🏖️', target: 2500, cur: 'EUR', saved: 900, deadline: +new Date(y + 1, 5, 15), created: start, history: [{ d: now - 30 * DAY, a: 300 }], demo: true },
    { id: uid(), name: 'Новый MacBook', emoji: '💻', target: 85000, cur: 'UAH', saved: 85000, created: start, done: true, history: [], demo: true }
  );
  S.limits = { cafe: 3500, delivery: 1500, shop: 4000, fun: 2500 };
  S.demo = true;
}

export function clearDemo() {
  const ids = new Set(S.accounts.filter((a) => a.demo).map((a) => a.id));
  S.accounts = S.accounts.filter((a) => !a.demo);
  S.tx = S.tx.filter((x) => !x.demo && !ids.has(x.acc));
  S.goals = S.goals.filter((g) => !g.demo);
  if (S.demo) S.limits = {};
  S.demo = false;
}
