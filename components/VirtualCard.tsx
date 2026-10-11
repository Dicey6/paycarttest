"use client";

import Image from "next/image";
import { Snowflake } from "lucide-react";

export function VirtualCard({
  revealed = false,
  frozen = false,
  size = "default",
  holderName = "",
  cardNumber = "",
  last4 = "",
  expiryMonth,
  expiryYear,
  balanceUsd,
}: {
  revealed?: boolean;
  frozen?: boolean;
  size?: "default" | "large";
  holderName?: string;
  cardNumber?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  /** When provided, the card shows this BowPay balance. */
  balanceUsd?: number;
}) {
  const dims =
    size === "large" ? "aspect-[1.586/1] w-full max-w-[260px]" : "aspect-[1.586/1] w-full max-w-[220px]";
  const tail = last4 || cardNumber.slice(-4) || "••••";
  const groups = cardNumber.length === 16 ? cardNumber.match(/.{4}/g)!.join("  ") : "";
  const expiry =
    expiryMonth && expiryYear
      ? `${String(expiryMonth).padStart(2, "0")}/${String(expiryYear).slice(-2)}`
      : "••/••";
  const name = holderName?.trim() ? holderName.trim().toUpperCase() : "YOUR NAME";

  return (
    <div
      className={`relative ${dims} rounded-xl p-3.5 flex flex-col justify-between overflow-hidden select-none shadow-lg transition-transform ${
        frozen ? "grayscale" : ""
      }`}
      style={{
        background:
          "linear-gradient(135deg, #0c0d0f 0%, #16171b 55%, #1b1420 100%)",
      }}
    >
      <div
        className="absolute -right-8 -top-8 w-28 h-28 rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, #8DDD00, transparent 70%)" }}
      />
      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-black flex items-center justify-center overflow-hidden">
            <Image src="/logo-mark.png" alt="" width={20} height={20} className="w-full h-full object-contain" />
          </div>
          <span className="text-white font-semibold text-xs tracking-tight">BowPay</span>
        </div>
        {frozen ? (
          <span className="flex items-center gap-1 text-[9px] font-medium text-white/70 bg-white/10 px-1.5 py-0.5 rounded-full">
            <Snowflake className="w-2.5 h-2.5" /> Frozen
          </span>
        ) : (
          <span className="text-[9px] font-medium text-white/50">Virtual</span>
        )}
      </div>

      <div className="relative z-10 space-y-1.5">
        {balanceUsd !== undefined && (
          <div>
            <div className="text-white/40 text-[8px] uppercase tracking-wide">Balance</div>
            <div className="text-white text-sm font-semibold leading-tight">
              {balanceUsd.toLocaleString(undefined, { style: "currency", currency: "USD" })}
            </div>
          </div>
        )}
        <div className="text-white text-xs tracking-[0.12em] font-medium">
          {revealed && groups ? groups : `••••  ••••  ••••  ${tail}`}
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-white/40 text-[8px] uppercase tracking-wide mb-0.5">Card holder</div>
            <div className="text-white text-[11px] font-medium truncate max-w-[120px]">{name}</div>
          </div>
          <div className="text-right">
            <div className="text-white/40 text-[8px] uppercase tracking-wide mb-0.5">Valid thru</div>
            <div className="text-white text-[11px] font-medium">{expiry}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
