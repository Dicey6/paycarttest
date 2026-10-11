import { NextRequest, NextResponse } from "next/server";
import { fetchSolanaBalances } from "@/lib/solana";
import { fetchRobinhoodBalances } from "@/lib/evm";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_RE = /^0x[0-9a-fA-F]{40}$/;

// Short in-memory cache + de-duplication so refresh spam never hammers the public RPCs.
const TTL_MS = 25_000;
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = fn()
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function settle<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "failed" };
  }
}

async function getPrices() {
  const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("price lookup failed");
  const json = await res.json();
  return { SOL: json?.solana?.usd as number | undefined, ETH: json?.ethereum?.usd as number | undefined };
}

export async function GET(req: NextRequest) {
  const sol = req.nextUrl.searchParams.get("sol") ?? "";
  const rh = req.nextUrl.searchParams.get("rh") ?? "";

  const [solana, robinhood, prices] = await Promise.all([
    SOL_RE.test(sol) ? settle(() => cached(`sol:${sol}`, () => fetchSolanaBalances(sol))) : undefined,
    EVM_RE.test(rh) ? settle(() => cached(`rh:${rh.toLowerCase()}`, () => fetchRobinhoodBalances(rh))) : undefined,
    settle(() => cached("prices", getPrices)),
  ]);

  return NextResponse.json(
    { solana, robinhood, prices: prices && !("error" in prices) ? prices : undefined },
    { headers: { "Cache-Control": "no-store" } }
  );
}
