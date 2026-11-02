// Statistics, subscription detection and smart insights.
import { S, cat, catName, txBase, toBase, convert, startOf, addUnit, daysInMonth, DAY, fmt, fmtDate, fmtNum } from './store.js';
import { merchantKey } from './cats.js';
import { t } from './i18n.js';

const isKind = (tx, kind) => cat(tx.cat).kind === kind;

// Sum of spending (positive number) in [from, to). Refunds in expense categories reduce it.
export function spend(from, to, pred) {
  let s = 0;
  for (const x of S.tx) {
    if (x.date < from || x.date >= to || !isKind(x, 'exp')) continue;
    if (pred && !pred(x)) continue;
    s -= txBase(x);
  }
  return Math.max(0, s);
}
export function income(from, to) {
  let s = 0;
  for (const x of S.tx) if (x.date >= from && x.date < to && isKind(x, 'inc')) s += txBase(x);
  return s;
}
export function byCat(from, to, kind = 'exp') {
  const m = new Map();
  for (const x of S.tx) {
    if (x.date < from || x.date >= to || !isKind(x, kind)) continue;
    const v = kind === 'exp' ? -txBase(x) : txBase(x);
    m.set(x.cat, (m.get(x.cat) || 0) + v);
  }
  return [...m.entries()].filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
}
// n periods ending with the one containing `end`
export function series(unit, n, end, kind = 'exp', pred) {
  const out = [];
  let s = startOf(end, unit);
  s = addUnit(s, unit, -(n - 1));
  for (let i = 0; i < n; i++) {
    const e = addUnit(s, unit, 1);
    const v = kind === 'exp' ? spend(+s, +e, pred) : income(+s, +e);
    out.push({ start: +s, end: +e, value: v });
    s = e;
  }
  return out;
}

const median = (a) => {
  if (!a.length) return 0;
  const b = [...a].sort((x, y) => x - y);
  const m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export function firstTxDate() {
  return S.tx.length ? S.tx[S.tx.length - 1].date : Date.now();
}

// average monthly spending over the last k full months that have data
export function avgMonthlySpend(k = 3, now = Date.now()) {
  const m0 = startOf(now, 'month');
  const first = firstTxDate();
  const vals = [];
  for (let i = 1; i <= k; i++) {
    const s = addUnit(m0, 'month', -i);
    if (+addUnit(s, 'month', 1) <= first) break;
    vals.push(spend(+s, +addUnit(s, 'month', 1)));
  }
  return mean(vals);
}
export function avgMonthlyNet(k = 3, now = Date.now()) {
  const m0 = startOf(now, 'month');
  const first = firstTxDate();
  const vals = [];
  for (let i = 1; i <= k; i++) {
    const s = addUnit(m0, 'month', -i);
    const e = addUnit(s, 'month', 1);
    if (+e <= first) break;
    vals.push(income(+s, +e) - spend(+s, +e));
  }
  return mean(vals);
}

/* ---------- subscriptions ---------- */
const SUB_FRIENDLY = new Set(['subs', 'telecom', 'sport', 'education', 'fun', 'health', 'other_exp', 'shop', 'tech']);
const PERIOD_DAYS = { w: 7, m: 30.44, y: 365 };

function prettyName(desc) {
  const s = String(desc || '').replace(/\s+/g, ' ').trim();
  return s.length > 32 ? s.slice(0, 30) + '…' : s;
}

export function subMonthly(s) {
  const b = convert(s.amount, s.cur, S.base);
  return s.period === 'w' ? (b * 52) / 12 : s.period === 'y' ? b / 12 : b;
}

export function detectSubs(now = Date.now()) {
  const groups = new Map();
  for (const x of S.tx) {
    if (x.amount >= 0 || !isKind(x, 'exp')) continue;
    const k = merchantKey(x.desc);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  const out = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date - b.date);
    const med = median(list.map((x) => -x.amount));
    const similar = list.filter((x) => Math.abs(-x.amount - med) <= Math.max(med * 0.15, 1));
    if (similar.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < similar.length; i++) gaps.push((similar[i].date - similar[i - 1].date) / DAY);
    const g = median(gaps);
    const period = g >= 26 && g <= 35 ? 'm' : g >= 6 && g <= 8 ? 'w' : g >= 350 && g <= 380 ? 'y' : null;
    if (!period) continue;
    const pd = PERIOD_DAYS[period];
    const regular = gaps.filter((x) => Math.abs(x - pd) <= pd * 0.25).length / gaps.length;
    if (regular < 0.7) continue;
    const last = similar[similar.length - 1];
    const amounts = similar.map((x) => -x.amount);
    const spread = (Math.max(...amounts) - Math.min(...amounts)) / med;
    const friendly = SUB_FRIENDLY.has(last.cat) || (spread < 0.03 && !['home', 'fees'].includes(last.cat));
    if (!friendly) continue;
    if (similar.length < 3 && last.cat !== 'subs' && period !== 'y') continue;
    if (now - last.date > pd * 1.6 * DAY) continue; // stopped paying
    out.push({
      key,
      name: prettyName(last.desc),
      amount: -last.amount,
      cur: last.cur,
      period,
      next: last.date + pd * DAY,
      cat: last.cat,
      count: similar.length,
      auto: true,
    });
  }
  const hidden = new Set(S.subs.hidden);
  const all = out.filter((s) => !hidden.has(s.key)).concat(S.subs.manual.map((m) => ({ ...m, auto: false })));
  for (const s of all) {
    if (!s.auto && s.next) {
      // roll manual next date forward
      const pd = PERIOD_DAYS[s.period] * DAY;
      while (s.next < now - DAY) s.next += pd;
    }
    s.monthly = subMonthly(s);
  }
  return all.sort((a, b) => b.monthly - a.monthly);
}

/* ---------- limits ---------- */
export function limitStatus(now = Date.now()) {
  const m0 = +startOf(now, 'month');
  const m1 = +addUnit(m0, 'month', 1);
  const daysLeft = Math.max(1, Math.ceil((m1 - now) / DAY));
  return Object.entries(S.limits)
    .filter(([, v]) => v > 0)
    .map(([id, limit]) => {
      const spent = spend(m0, m1, (x) => x.cat === id);
      const left = limit - spent;
      return { id, limit, spent, left, ratio: spent / limit, perDay: Math.max(0, left) / daysLeft, daysLeft };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/* ---------- goals ---------- */
export function goalSaved(g) {
  if (g.jarId && S.mono?.jars) {
    const j = S.mono.jars.find((x) => x.id === g.jarId);
    if (j) return convert(j.balance, j.cur, g.cur);
  }
  return g.saved || 0;
}
export function goalPlan(g, now = Date.now()) {
  const saved = goalSaved(g);
  const remaining = Math.max(0, g.target - saved);
  const res = { saved, remaining, pct: g.target ? Math.min(1, saved / g.target) : 0 };
  if (g.deadline) {
    const months = Math.max(0.25, (g.deadline - now) / (30.44 * DAY));
    res.monthsLeft = months;
    res.perMonth = remaining / months;
    res.perWeek = remaining / (months * 4.345);
    res.overdue = g.deadline < now && remaining > 0;
  }
  // pace from contributions in the last 90 days
  const since = now - 90 * DAY;
  const contrib = (g.history || []).filter((h) => h.d >= since).reduce((s, h) => s + h.a, 0);
  const pace = contrib / 3;
  if (pace > 0 && remaining > 0) {
    res.pace = pace;
    res.eta = now + (remaining / pace) * 30.44 * DAY;
  }
  return res;
}

/* ---------- insights ---------- */
const pct = (x) => Math.round(x * 100);
const roundK = (v) => (v >= 10000 ? Math.round(v / 1000) * 1000 : Math.round(v / 100) * 100);
const monthName = (d) => fmtDate(d, { month: 'long' });

export function buildInsights(now = Date.now()) {
  const out = [];
  if (S.tx.length < 5) return out;
  const m0 = startOf(now, 'month');
  const m0n = +m0;
  const elapsed = Math.max(0.5, (now - m0n) / DAY);
  const dom = new Date(now).getDate();
  const dim = daysInMonth(m0);
  const first = firstTxDate();
  const cur = spend(m0n, now + 1);
  const prev = addUnit(m0, 'month', -1);
  const prevFull = spend(+prev, m0n);
  const hasPrev = first < m0n - 20 * DAY;
  const avgMonth = avgMonthlySpend(3, now) || prevFull;
  const big = (v) => v > Math.max(convert(300, 'UAH', S.base), avgMonth * 0.03);

  // 1. Pace of this month
  if (dom >= 3 && hasPrev && prevFull > 0) {
    const forecast = (cur / elapsed) * dim;
    const d = forecast / prevFull - 1;
    const p = { forecast: fmt(forecast), month: monthName(m0), prevMonth: monthName(prev), prev: fmt(prevFull), pct: Math.abs(pct(d)) };
    if (d > 0.1) out.push({ id: 'pace', tone: 'warn', icon: '📈', score: 80 + d * 20, title: t('ins.paceUp.t'), text: t('ins.paceUp', p) });
    else if (d < -0.1) out.push({ id: 'pace', tone: 'good', icon: '🌿', score: 40, title: t('ins.paceDown.t'), text: t('ins.paceDown', p) });
    else out.push({ id: 'pace', tone: 'info', icon: '🧭', score: 20, title: t('ins.paceOk.t'), text: t('ins.paceOk', p) });
  }

  // 2. Category spikes / drops vs the same days of previous months
  if (dom >= 5 && hasPrev) {
    const prevMonths = [1, 2, 3].map((i) => addUnit(m0, 'month', -i)).filter((s) => +addUnit(s, 'month', 1) > first);
    const curCats = new Map(byCat(m0n, now + 1));
    const ups = [];
    const downs = [];
    for (const c of S.cats.filter((c) => c.kind === 'exp')) {
      const vals = prevMonths.map((s) => spend(+s, +s + elapsed * DAY, (x) => x.cat === c.id));
      const avg = mean(vals);
      const v = curCats.get(c.id) || 0;
      if (avg > 0 && v > avg * 1.3 && big(v - avg)) ups.push({ c, v, avg, d: v - avg });
      if (dom >= 10 && big(avg) && v < avg * 0.7) downs.push({ c, v, avg, d: avg - v });
    }
    ups.sort((a, b) => b.d - a.d).slice(0, 2).forEach((u) =>
      out.push({
        id: 'up-' + u.c.id,
        tone: 'warn',
        icon: u.c.emoji,
        score: 70 + Math.min(20, u.d / (avgMonth || 1) * 100),
        title: t('ins.catUp.t', { cat: catName(u.c), pct: pct(u.v / u.avg - 1) }),
        text: t('ins.catUp', { cur: fmt(u.v), avg: fmt(u.avg), diff: fmt(u.d) }),
        cat: u.c.id,
      })
    );
    downs.sort((a, b) => b.d - a.d).slice(0, 1).forEach((u) =>
      out.push({
        id: 'down-' + u.c.id,
        tone: 'good',
        icon: u.c.emoji,
        score: 35,
        title: t('ins.catDown.t', { cat: catName(u.c), pct: pct(1 - u.v / u.avg) }),
        text: t('ins.catDown', { diff: fmt(u.d) }),
        cat: u.c.id,
      })
    );
  }

  // 3. Limits
  for (const l of limitStatus(now)) {
    const name = catName(l.id);
    if (l.ratio >= 1)
      out.push({ id: 'lim-' + l.id, tone: 'warn', icon: '🚧', score: 90, title: t('ins.limOver.t', { cat: name }), text: t('ins.limOver', { over: fmt(-l.left), limit: fmt(l.limit) }), action: 'limits' });
    else if (l.ratio >= 0.8)
      out.push({ id: 'lim-' + l.id, tone: 'warn', icon: '⚠️', score: 75, title: t('ins.limNear.t', { cat: name, pct: pct(l.ratio) }), text: t('ins.limNear', { left: fmt(l.left), days: l.daysLeft, perDay: fmt(l.perDay) }), action: 'limits' });
  }

  // 4. Savings rate of last full month
  if (hasPrev) {
    const inc = income(+prev, m0n);
    if (inc > 0) {
      const rate = (inc - prevFull) / inc;
      const p = { month: monthName(prev), pct: pct(rate), saved: fmt(inc - prevFull), inc: fmt(inc), gap: fmt(Math.max(0, inc * 0.2 - (inc - prevFull))), over: fmt(prevFull - inc) };
      if (rate >= 0.2) out.push({ id: 'rate', tone: 'good', icon: '🏆', score: 45, title: t('ins.rateGood.t', p), text: t('ins.rateGood', p) });
      else if (rate >= 0) out.push({ id: 'rate', tone: 'info', icon: '🎯', score: 55, title: t('ins.rateMid.t', p), text: t('ins.rateMid', p) });
      else out.push({ id: 'rate', tone: 'warn', icon: '🔥', score: 85, title: t('ins.rateNeg.t'), text: t('ins.rateNeg', p) });
    }
  }

  // 5. Goal acceleration through the biggest "want" category
  const wantAvg = new Map();
  if (hasPrev) {
    const from = +addUnit(m0, 'month', -3);
    const months = Math.max(1, Math.min(3, (m0n - Math.max(from, first)) / (30.44 * DAY)));
    for (const [id, v] of byCat(Math.max(from, first), m0n)) if (cat(id).group === 'want') wantAvg.set(id, v / months);
  }
  const topWant = [...wantAvg.entries()].sort((a, b) => b[1] - a[1])[0];
  const goal = S.goals.find((g) => !g.done && goalPlan(g, now).remaining > 0);
  if (topWant && big(topWant[1])) {
    const cut = topWant[1] * 0.2;
    const cname = catName(topWant[0]);
    const net = avgMonthlyNet(3, now);
    if (goal) {
      const remaining = convert(goalPlan(goal, now).remaining, goal.cur, S.base);
      if (net > 0) {
        const faster = remaining / net - remaining / (net + cut);
        if (faster >= 0.5)
          out.push({ id: 'goalcut', tone: 'info', icon: goal.emoji || '🎯', score: 60, title: t('ins.goalCut.t', { goal: goal.name }), text: t('ins.goalCut', { cat: cname, cut: fmt(cut), goal: goal.name, months: fmtNum(faster, faster < 10 ? 1 : 0) }), action: 'goals' });
      } else {
        out.push({ id: 'goalcut', tone: 'info', icon: goal.emoji || '🎯', score: 58, title: t('ins.goalCut.t', { goal: goal.name }), text: t('ins.goalCutNoNet', { cat: cname, cut: fmt(cut), year: fmt(cut * 12) }), action: 'goals' });
      }
    } else {
      out.push({ id: 'wantcut', tone: 'info', icon: cat(topWant[0]).emoji, score: 30, title: t('ins.wantCut.t', { cat: cname }), text: t('ins.wantCut', { cat: cname, avg: fmt(topWant[1]), cut: fmt(cut), year: fmt(cut * 12) }) });
    }
  }

  // 6. Small purchases ("latte factor")
  {
    const th = convert(150, 'UAH', S.base);
    const small = S.tx.filter((x) => x.date >= now - 30 * DAY && isKind(x, 'exp') && x.amount < 0 && -txBase(x) < th && !['home', 'fees', 'telecom'].includes(x.cat));
    const sum = small.reduce((s, x) => s - txBase(x), 0);
    if (small.length >= 12 && big(sum))
      out.push({ id: 'small', tone: 'info', icon: '🪙', score: 50, title: t('ins.small.t', { n: small.length, sum: fmt(sum) }), text: t('ins.small', { year: fmt(sum * 12.17), th: fmt(th) }) });
  }

  // 7. Subscriptions
  {
    const subs = detectSubs(now);
    const m = subs.reduce((s, x) => s + x.monthly, 0);
    if (subs.length >= 2) out.push({ id: 'subs', tone: 'info', icon: '🔁', score: 42, title: t('ins.subs.t', { m: fmt(m) }), text: t('ins.subs', { n: subs.length, y: fmt(m * 12) }), action: 'subs' });
  }

  // 8. Weekend vs weekdays over the last 8 weeks
  {
    const from = Math.max(first, now - 56 * DAY);
    if (now - from > 20 * DAY) {
      let we = 0, wd = 0, nwe = 0, nwd = 0;
      for (let d = +startOf(from, 'day'); d < +startOf(now, 'day'); d += DAY) {
        const v = spend(d, d + DAY, (x) => !['home', 'fees', 'telecom', 'subs'].includes(x.cat));
        const w = new Date(d).getDay();
        if (w === 0 || w === 6) { we += v; nwe++; } else { wd += v; nwd++; }
      }
      const a = we / (nwe || 1), b = wd / (nwd || 1);
      if (b > 0 && a > b * 1.6 && big(a * 8))
        out.push({ id: 'weekend', tone: 'info', icon: '🎉', score: 32, title: t('ins.weekend.t', { x: fmtNum(a / b, 1) }), text: t('ins.weekend', { we: fmt(a), wd: fmt(b) }) });
    }
  }

  // 9. Unusually large purchase in the last 7 days
  {
    const recent = S.tx.filter((x) => x.date >= now - 7 * DAY && isKind(x, 'exp') && x.amount < 0);
    let best = null;
    for (const x of recent) {
      const hist = S.tx.filter((y) => y.cat === x.cat && y.amount < 0 && y.id !== x.id && y.date >= now - 120 * DAY).map((y) => -txBase(y));
      if (hist.length < 4) continue;
      const m = median(hist);
      const v = -txBase(x);
      const k = v / (m || 1);
      if (k >= 3 && v > convert(2000, 'UAH', S.base) && (!best || k > best.k)) best = { x, k, v };
    }
    if (best)
      out.push({ id: 'large', tone: 'info', icon: '💸', score: 38, title: t('ins.large.t', { desc: prettyName(best.x.desc) || catName(best.x.cat) }), text: t('ins.large', { v: fmt(best.v), date: fmtDate(best.x.date), k: fmtNum(best.k, 0), cat: catName(best.x.cat) }) });
  }

  // 10. No-spend days this month
  {
    let n = 0;
    for (let d = m0n; d < +startOf(now, 'day'); d += DAY) if (d >= first && spend(d, d + DAY, (x) => !['home', 'fees', 'telecom', 'subs'].includes(x.cat)) === 0) n++;
    if (n >= 3) out.push({ id: 'nospend', tone: 'good', icon: '🧘', score: 25, title: t('ins.nospend.t', { n }), text: t('ins.nospend') });
  }

  // 11. Emergency fund suggestion
  {
    const has = S.goals.some((g) => g.emoji === '🛡️' || /подушк|резерв|запас|emergenc|cushion|safety|rainy/i.test(g.name));
    if (!has && avgMonth > 0 && hasPrev)
      out.push({ id: 'emergency', tone: 'info', icon: '🛡️', score: 28, title: t('ins.emergency.t'), text: t('ins.emergency', { a: fmt(roundK(avgMonth * 3)), b: fmt(roundK(avgMonth * 6)) }), action: 'newEmergency', target: roundK(avgMonth * 3) });
  }

  const rank = { warn: 2, info: 1, good: 0 };
  return out.sort((a, b) => b.score - a.score || rank[b.tone] - rank[a.tone]);
}

// Needs / wants / savings split for a period (50/30/20 rule)
export function splitNWS(from, to) {
  let needs = 0, wants = 0;
  for (const x of S.tx) {
    if (x.date < from || x.date >= to) continue;
    const c = cat(x.cat);
    if (c.kind !== 'exp') continue;
    if (c.group === 'need') needs -= txBase(x);
    else wants -= txBase(x);
  }
  const inc = income(from, to);
  return { needs: Math.max(0, needs), wants: Math.max(0, wants), inc, savings: Math.max(0, inc - needs - wants) };
}
