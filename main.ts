// Stabilised dip-buy bot for the make.fun Solana bars replay (agent-fun/bars-replay/v1).
//
// Strategy: dip-buy mean reversion, the family that wins these replay races.
// For each symbol, on a bar's close (filled at the next open):
//   - Entry: the close is at least 2% below its 12-bar high, the RSI(14) is
//     oversold (< 35), and the bar closed up on the previous close, i.e. the
//     price has stopped making new lows. Never catch a falling knife: no new
//     low, no buy.
//   - Size: one equal slice, equity / 7, capped by the 25% per-position weight
//     cap and by the cash left in this reply. At most one open position per
//     symbol, so at most 7 open at once.
//   - Exit, the whole position: +2.5% over cost (bank the bounce), -6% under
//     cost (hard stop, loose enough to let a bounce recover), RSI(14) >= 65
//     (overbought), or 18 bars held without another exit (time-stop: keeps
//     the bot cycling so it clears the 8-trade guardrail even on a quiet
//     72-bar window, and frees the capital for the next dip). A refused sell
//   - No bank target: in an up-trending final window the bot must stay
//     invested to beat buy-and-hold, so it keeps re-entering dips instead of
//     going flat at +2% equity.
//
// All math is float64 on the bars' raw close units (ratios only, so the scale
// cancels) plus bigint for money, exactly as the harness reports it. No clock,
// no environment, no randomness: the same bars give the same orders, run
// after run, so the grader's two executions match byte for byte.

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const RSI_BARS = 14;
const DIP_WINDOW = 12;
const DIP_BPS = 200; // 2% below the 12-bar high
const RSI_ENTRY_BELOW = 35;
const RSI_EXIT_ABOVE = 65;
const TAKE_PROFIT_BPS = 250; // +2.5% over cost
const STOP_LOSS_BPS = 600; // -6% under cost
const HOLD_MAX_BARS = 18; // time-stop: free the capital after 18h without an exit
const SLICES = 7; // one slice per symbol in the universe
const MAX_SLIPPAGE_BPS = 100; // 1% past the close the order was decided on

interface Series {
  /** Closes, oldest first, capped at DIP_WINDOW. Raw units; ratios only. */
  closes: number[];
  prevClose: number | null;
  /** The first RSI_BARS changes, while the Wilder averages are not set yet. */
  first: number[];
  gain: number | null;
  loss: number | null;
}

const series = new Map<string, Series>();

function push(bar: Bar): void {
  let s = series.get(bar.symbol);
  if (s === undefined) series.set(bar.symbol, (s = { closes: [], prevClose: null, first: [], gain: null, loss: null }));
  const c = Number(bar.c);
  s.closes.push(c);
  if (s.closes.length > DIP_WINDOW) s.closes.shift();
  if (s.prevClose !== null) {
    const change = c - s.prevClose;
    if (s.gain === null || s.loss === null) {
      s.first.push(change);
      if (s.first.length === RSI_BARS) {
        s.gain = s.first.reduce((a, x) => a + (x > 0 ? x : 0), 0) / RSI_BARS;
        s.loss = s.first.reduce((a, x) => a + (x < 0 ? -x : 0), 0) / RSI_BARS;
      }
    } else {
      s.gain = (s.gain * (RSI_BARS - 1) + (change > 0 ? change : 0)) / RSI_BARS;
      s.loss = (s.loss * (RSI_BARS - 1) + (change < 0 ? -change : 0)) / RSI_BARS;
    }
  }
  s.prevClose = c;
}

function rsi(s: Series): number | null {
  if (s.gain === null || s.loss === null) return null;
  const moved = s.gain + s.loss;
  return moved === 0 ? 50 : (100 * s.gain) / moved;
}

/** The highest close of the last DIP_WINDOW bars, or null before enough bars. */
function windowHigh(s: Series): number | null {
  if (s.closes.length < DIP_WINDOW) return null;
  let hi = s.closes[0]!;
  for (const c of s.closes) if (c > hi) hi = c;
  return hi;
}

/** Whether a held position exits on this close: take-profit, stop-loss, overbought, or time-stop. */
function exits(state: BarsState, symbol: string, held: { qty: bigint; cost: bigint }, r: number | null): boolean {
  if (r !== null && r >= RSI_EXIT_ABOVE) return true;
  const value = state.value(symbol, held.qty);
  // value * 10000 >= cost * (10000 + TAKE_PROFIT_BPS), in exact bigint math.
  if (value * BigInt(10_000) >= held.cost * BigInt(10_000 + TAKE_PROFIT_BPS)) return true;
  if (value * BigInt(10_000) <= held.cost * BigInt(10_000 - STOP_LOSS_BPS)) return true;
  const since = heldSince.get(symbol);
  if (since !== undefined && state.seq - since >= HOLD_MAX_BARS) return true;
  return false;
}

/** First batch seq at which each open position was seen (for the time-stop). */
const heldSince = new Map<string, number>();

await runBars({
  onBatch(state, batch) {
    for (const bar of batch.bars) push(bar);
    // While warming up every order would be rejected (warmup) and never retried.
    if (state.warmingUp) return [];
    const fresh = new Set(batch.bars.map((b) => b.symbol));
    const { caps, fees } = state.hello;
    // Track how long each position has been held (time-stop clock).
    for (const symbol of heldSince.keys()) if (!state.positions.has(symbol)) heldSince.delete(symbol);
    for (const symbol of state.positions.keys()) if (!heldSince.has(symbol)) heldSince.set(symbol, state.seq);
    const sells: SellInput[] = [];
    const entries: string[] = [];
    for (const { symbol } of state.hello.symbols) {
      const s = series.get(symbol);
      if (s === undefined || !fresh.has(symbol)) continue;
      const r = rsi(s);
      const held = state.positions.get(symbol);
      if (held !== undefined) {
        if (exits(state, symbol, held, r)) sells.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        continue;
      }
      if (r === null || r >= RSI_ENTRY_BELOW) continue;
      const hi = windowHigh(s);
      if (hi === null) continue;
      const c = s.prevClose!;
      // At least 2% below the 12-bar high, and the bar closed up: the dip has stabilised.
      if (c * 10_000 > hi * (10_000 - DIP_BPS)) continue;
      if (s.closes.length < 2 || c < s.closes[s.closes.length - 2]!) continue;
      entries.push(symbol);
    }

    const orders: (SellInput | BuyInput)[] = sells.slice(0, caps.max_orders_per_bar);
    const stake = state.equity / BigInt(SLICES);
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let room = caps.max_open_positions - state.positions.size;
    let cash = state.cash;
    for (const symbol of entries) {
      if (room <= 0 || orders.length >= caps.max_orders_per_bar) break;
      let slice = stake < byWeight ? stake : byWeight;
      if (cash < slice) slice = cash;
      if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) break;
      orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cash -= slice;
      room--;
    }
    return orders;
  },
});
