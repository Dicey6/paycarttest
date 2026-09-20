"use client";

import { useEffect, useState } from "react";

export function EthTicker() {
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true"
    )
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const livePrice = d?.ethereum?.usd;
        const liveChange = d?.ethereum?.usd_24h_change;
        if (typeof livePrice === "number") {
          setPrice(livePrice);
          setChange(liveChange ?? 0);
          setStatus("live");
        } else {
          setStatus("fallback");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fallbackPrice = 3420.15;
  const fallbackChange = 1.8;
  const displayPrice = status === "live" ? price! : fallbackPrice;
  const displayChange = status === "live" ? change ?? 0 : fallbackChange;
  const positive = displayChange >= 0;

  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 pl-2 pr-3.5 py-1.5">
      <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center text-[11px] font-bold text-brand-dark dark:text-brand">
        Ξ
      </div>
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">ETH</span>
      {status === "loading" ? (
        <span className="text-xs text-neutral-400 dark:text-neutral-500">Loading price…</span>
      ) : (
        <>
          <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-50">
            $
            {displayPrice.toLocaleString(undefined, {
              maximumFractionDigits: 2,
              minimumFractionDigits: 2,
            })}
          </span>
          <span
            className={`text-xs font-medium ${
              positive ? "text-brand-dark dark:text-brand" : "text-red-500"
            }`}
          >
            {positive ? "+" : ""}
            {displayChange.toFixed(2)}%
          </span>
        </>
      )}
    </div>
  );
}
