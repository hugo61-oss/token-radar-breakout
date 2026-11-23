// Breakout Radar — the volume-breakout model for token-radar-01.
//
// Angle: rank pre-token protocols by what a token would be worth *right now that
// volume is breaking out*. A launch is worth more when capital is already moving
// into the protocol this week, so the model's centre is the seven-day TVL move,
// read against the protocol's own category, not a flat multiple on size.
//
//   multiple     = median mcap / TVL of the tokenized peers in the protocol's
//                  own category (at least 3 peers; otherwise the whole market's
//                  median), clamped to [0.05, 1.5]. A category's own market
//                  prices its launches; no protocol name is ever special-cased.
//   breakout     = 1 + 0.9 * tanh(clamp(change_7d, -50, 150) / 40)
//                  A saturating curve: +40% in a week is a real breakout and
//                  earns most of the boost, +4000% on a tiny base earns no more
//                  than +150% does, and a -50% week can only halve the value.
//                  No 7-day figure reported means no breakout signal: 1.0.
//   maturity     = 0.7 + 0.3 * min(age_days, 1095) / 1095
//                  (age unknown: 365 days). A protocol that has run longer with
//                  no token has more pent-up launch value, but age alone never
//                  doubles anything.
//   implied      = max(1, round(tvl_usd * multiple * breakout * maturity))
//
// The board covers every slug on the snapshot's watchlist (the floor, never the
// ceiling) and adds the 60 strongest pre-token protocols below the floor by this
// implied value — the early radar finds breakouts, not just big protocols. A
// protocol is rankable when it records no token and is not a wrapped, staked or
// bridged product, not an exchange, and not a versioned pool of another
// protocol. Live-token protocols are kept apart and shown as the market's own
// values, never mixed into the ranked board.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  breakout_weight: number;
  breakout_scale: number;
  breakout_floor: number;
  breakout_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_peers: number;
}

export const MODEL: ModelConstants = {
  breakout_weight: 0.9,
  breakout_scale: 40,
  breakout_floor: -50,
  breakout_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 1.5,
  min_peers: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'breakout-1';

/** How many pre-token protocols below the watchlist floor the breakout radar carries. */
export const EARLY_ROWS = 60;

/** How many live-token protocols the comparables view carries, by market cap. */
export const LIVE_ROWS = 12;

/** A breakout tier, from the seven-day move alone. */
export type BreakoutTier = 'BREAKOUT' | 'HEATING' | 'STEADY' | 'COOLING' | 'UNRATED';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  breakout_score: number;
  breakout_tier: BreakoutTier;
  model: {
    category_multiple: number;
    category_peers: number;
    growth_pct: number;
    breakout_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the farm plan is generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  breakout_score: number;
  breakout_tier: BreakoutTier;
  category_multiple: number;
  breakout_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** One category's comparable pricing, for the dashboard's comparables strip. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  peers: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist_slugs: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  rows: RadarRow[];
  live: LiveRow[];
  categories: CategoryMultiple[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty sorted-by-value list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The breakout tier of a seven-day move: the tier is the move alone, never the size. */
export function breakoutTier(change7d: number | null): BreakoutTier {
  if (change7d === null || !Number.isFinite(change7d)) return 'UNRATED';
  const score = 50 + 50 * Math.tanh(change7d / 40);
  if (score >= 80) return 'BREAKOUT';
  if (score >= 65) return 'HEATING';
  if (score >= 40) return 'STEADY';
  return 'COOLING';
}

/** The 0-100 breakout score of a seven-day move; 50 is flat, 100 is a vertical week. */
export function breakoutScore(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 50;
  return Math.round(50 + 50 * Math.tanh(change7d / 40));
}

/**
 * The category multiples: for every category, the median mcap / TVL of its
 * tokenized peers (a peer needs a market cap and a positive TVL). Categories
 * with fewer than `min_peers` peers fall back to the whole market's median.
 * The multiples come only from this snapshot's own figures.
 */
export function categoryMultiples(
  protocols: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): { byCategory: Map<string, { multiple: number; peers: number }>; global: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      all.push(ratio);
      const key = p.category ?? 'Uncategorized';
      const list = byCat.get(key) ?? [];
      list.push(ratio);
      byCat.set(key, list);
    }
  }
  const global = all.length > 0 ? median(all) : 0.2;
  const clamp = (v: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
  const byCategory = new Map<string, { multiple: number; peers: number }>();
  for (const [cat, ratios] of byCat) {
    byCategory.set(cat, ratios.length >= model.min_peers ? { multiple: clamp(median(ratios)), peers: ratios.length } : { multiple: clamp(global), peers: ratios.length });
  }
  return { byCategory, global: clamp(global) };
}

/** The breakout multiplier of a seven-day move: saturating, so an extreme week cannot run away. */
export function breakoutMultiplier(change7d: number | null, model: ModelConstants = MODEL): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  const growth = Math.min(model.breakout_cap, Math.max(model.breakout_floor, change7d));
  return 1 + model.breakout_weight * Math.tanh(growth / model.breakout_scale);
}

/** The maturity multiplier of an age in days: longer with no token, more pent-up value. */
export function maturityMultiplier(age: number | null, model: ModelConstants = MODEL): number {
  const days = age ?? model.unknown_age_days;
  return model.maturity_floor + (Math.min(Math.max(days, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, { multiple: number; peers: number }>; global: number },
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; peers: number; growthPct: number; breakoutMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const found = multiples.byCategory.get(protocol.category ?? 'Uncategorized');
  const multiple = found !== undefined ? found.multiple : multiples.global;
  const peers = found !== undefined ? found.peers : 0;
  const growthPct = protocol.change_7d === null ? 0 : Math.min(model.breakout_cap, Math.max(model.breakout_floor, protocol.change_7d));
  const breakoutMult = breakoutMultiplier(protocol.change_7d, model);
  const maturityMult = maturityMultiplier(age, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * breakoutMult * maturityMult));
  return { implied, multiple, peers, growthPct, breakoutMult, maturityMult, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** An exchange's name at the start of a protocol's name. */
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** Categories that are a wrapped, staked or bridged product, never a launch of their own. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol is one the board may rank: pre-token and plausibly its own launch. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_START.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const multiples = categoryMultiples(snapshot.protocols, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever its week looked like.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by implied
  // value under the breakout model — momentum first, not size first. A chosen
  // protocol stays chosen; the floor is never a replacement for a watchlist row.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, value: impliedValue(p, snapshot.as_of, multiples, model).implied }))
    .sort((a, b) => b.value - a.value || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    breakout_score: breakoutScore(s.p.change_7d),
    breakout_tier: breakoutTier(s.p.change_7d),
    model: {
      category_multiple: round4(s.multiple),
      category_peers: s.peers,
      growth_pct: round4(s.growthPct),
      breakout_multiplier: round4(s.breakoutMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the breakout tier: a hot breakout is farmed now and checked sooner. */
function holdDaysFor(p: SnapshotProtocol, age: number | null): number {
  const tier = breakoutTier(p.change_7d);
  if (tier === 'BREAKOUT') return 21;
  if (tier === 'HEATING') return 30;
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and leave the loan open so the position counts.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the LP tokens.`;
  if (c.includes('yield') || c.includes('vault') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name}, then use the funds inside its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} through ${name} on ${chain} and keep the staking receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Post $${capital} of USDC as margin on ${name} (${chain}) and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund ${name} with $${capital} and take one position in an open market.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} through ${name}'s stablecoin on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('risk')) return `Deposit $${capital} into a ${name} curated vault on ${chain} and hold the shares.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: five steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * seven-day move, age), never from a hand-written list of names. A breakout
 * tier changes the urgency: BREAKOUT rows say to enter now, before the crowd
 * reprices the farm, and to re-check weekly while the move holds.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(p, age);
  const tier = breakoutTier(p.change_7d);
  const action = actionFor(p, capital, chain);
  const urgency =
    tier === 'BREAKOUT'
      ? `TVL is breaking out this week, so enter now while the farm is still cheap to join.`
      : tier === 'HEATING'
        ? `TVL is heating up this week, so enter this week rather than next.`
        : tier === 'COOLING'
          ? `TVL cooled this week, so enter small and add only if the move turns.`
          : `Enter at your own pace; nothing in this week's move sets a deadline.`;
  return [
    {
      text: `Open a fresh wallet holding only the funds you plan to farm, and keep its seed phrase offline. ${urgency}`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week — a deposit, a borrow, a swap or a vote — while the breakout holds.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity lands in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's comparables view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && (p.category === null || !EXCLUDED_CATEGORIES.has(p.category)))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    breakout_score: row.breakout_score,
    breakout_tier: row.breakout_tier,
    category_multiple: row.model.category_multiple,
    breakout_multiplier: row.model.breakout_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const multiples = categoryMultiples(snapshot.protocols, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const categories: CategoryMultiple[] = [...multiples.byCategory.entries()]
    .filter(([, v]) => v.peers >= model.min_peers)
    .map(([category, v]) => ({ category, multiple: round4(v.multiple), peers: v.peers }))
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist_slugs: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(multiples.global),
    rows: board.map(radarRow),
    live,
    categories,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  const rows = radar.rows.map((r) => [
    r.rank, r.slug, r.name, r.category, r.chains, r.tvl_usd, r.change_7d, r.listed_at, r.age_days,
    r.implied_value_usd, r.breakout_score, r.breakout_tier, r.category_multiple, r.breakout_multiplier, r.maturity_multiplier,
  ]);
  const live = radar.live.map((l) => [l.slug, l.name, l.category, l.chains, l.tvl_usd, l.mcap_usd, l.change_7d, l.multiple]);
  const compact = {
    as_of: radar.as_of,
    floor_usd: radar.floor_usd,
    model_version: radar.model_version,
    watchlist_size: radar.watchlist_size,
    watchlist_slugs: radar.watchlist_slugs,
    board_size: radar.board_size,
    early_size: radar.early_size,
    global_multiple: radar.global_multiple,
    rows,
    live,
    categories: radar.categories,
  };
  return `window.BREAKOUT_RADAR=${JSON.stringify(compact)};\n`;
}
