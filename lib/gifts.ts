import { getSupabaseBrowserClient } from "./supabase";

export const GIFT_MIN = 5;
export const GIFT_MAX = 10000;
export const GIFT_FEE = 1;

export type GiftTheme = "lime" | "midnight" | "sunset";

export const GIFT_THEMES: Record<
  GiftTheme,
  { label: string; from: string; to: string; ink: string; chipBg: string; chipInk: string }
> = {
  lime: { label: "Lime", from: "#A6EF33", to: "#5E9E00", ink: "#0c0d0f", chipBg: "rgba(12,13,15,0.92)", chipInk: "#A6EF33" },
  midnight: { label: "Midnight", from: "#121317", to: "#2b1f44", ink: "#ffffff", chipBg: "rgba(141,221,0,0.14)", chipInk: "#8DDD00" },
  sunset: { label: "Sunset", from: "#ff9a5a", to: "#c2336b", ink: "#ffffff", chipBg: "rgba(0,0,0,0.28)", chipInk: "#ffffff" },
};

export type GiftRow = {
  id: string;
  code: string;
  creator_id: string;
  amount_usd: number;
  fee_usd: number;
  theme: GiftTheme;
  message: string | null;
  status: "active" | "claimed";
  claimed_at: string | null;
  created_at: string;
};

export type GiftCardData = {
  code: string;
  amount_usd: number;
  theme: GiftTheme;
  message: string | null;
};

const norm = (row: GiftRow): GiftRow => ({ ...row, amount_usd: Number(row.amount_usd), fee_usd: Number(row.fee_usd) });

export async function fetchBalanceUsd(): Promise<number> {
  const { data, error } = await getSupabaseBrowserClient().from("balances").select("balance_usd").maybeSingle();
  if (error) throw error;
  return data ? Number(data.balance_usd) : 0;
}

export async function createGiftCard(amount: number, message: string, theme: GiftTheme): Promise<GiftRow> {
  const { data, error } = await getSupabaseBrowserClient().rpc("create_gift_card", {
    p_amount: amount,
    p_message: message.trim() || null,
    p_theme: theme,
  });
  if (error) throw error;
  return norm((Array.isArray(data) ? data[0] : data) as GiftRow);
}

export async function claimGiftCard(code: string) {
  const { data, error } = await getSupabaseBrowserClient().rpc("claim_gift_card", { p_code: code });
  if (error) throw error;
  const r = data as { amount_usd: number; message: string | null; from_username: string | null };
  return { amount: Number(r.amount_usd), message: r.message, from: r.from_username };
}

export async function fetchMyGiftCards(userId: string): Promise<GiftRow[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from("gift_cards")
    .select("id, code, creator_id, amount_usd, fee_usd, theme, message, status, claimed_at, created_at")
    .eq("creator_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return ((data ?? []) as GiftRow[]).map(norm);
}

const ERRORS: Record<string, string> = {
  insufficient_balance: "Your BowPay balance is too low for this gift (the $1 fee is added on top).",
  amount_too_low: `The minimum gift is $${GIFT_MIN}.`,
  amount_too_high: `The maximum gift is $${GIFT_MAX.toLocaleString()}.`,
  bad_amount: "Use at most 2 decimal places.",
  invalid_code: "That code isn't valid. Check it and try again.",
  already_claimed: "This gift card has already been claimed.",
  own_card: "You can't claim a gift card you created.",
  not_authenticated: "Please log in again.",
};

export function giftError(err: unknown) {
  const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? "";
  for (const key of Object.keys(ERRORS)) if (message.includes(key)) return ERRORS[key];
  return message || "Something went wrong. Try again.";
}

/* ------------------------------ card artwork ------------------------------ */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text: string, max = 36, lines = 2) {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max && line) {
      out.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) out.push(line);
  return out.slice(0, lines);
}

export function giftCardSvg(card: GiftCardData) {
  const t = GIFT_THEMES[card.theme] ?? GIFT_THEMES.lime;
  const amount = Number.isInteger(card.amount_usd) ? String(card.amount_usd) : card.amount_usd.toFixed(2);
  const msg = card.message ? wrap(card.message) : [];
  const sans = "-apple-system, BlinkMacSystemFont, Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.from}"/><stop offset="1" stop-color="${t.to}"/></linearGradient></defs>
<rect width="640" height="400" rx="28" fill="url(#g)"/>
<circle cx="580" cy="40" r="170" fill="#fff" opacity="0.10"/>
<circle cx="60" cy="400" r="130" fill="#000" opacity="0.10"/>
<g transform="translate(52 50)" fill="${t.ink}"><ellipse cx="-10" cy="0" rx="11" ry="7" transform="rotate(-28 -10 0)"/><ellipse cx="10" cy="0" rx="11" ry="7" transform="rotate(28 10 0)"/><circle r="5"/></g>
<text x="82" y="58" font-family="${sans}" font-size="22" font-weight="700" fill="${t.ink}">BowGift</text>
<text x="600" y="57" font-family="${sans}" font-size="14" font-weight="600" fill="${t.ink}" opacity="0.7" text-anchor="end">BowPay</text>
<text x="40" y="132" font-family="${sans}" font-size="13" font-weight="600" letter-spacing="4" fill="${t.ink}" opacity="0.7">GIFT CARD</text>
<text x="38" y="206" font-family="${sans}" font-size="84" font-weight="800" fill="${t.ink}">$${amount}</text>
${msg.map((l, i) => `<text x="40" y="${242 + i * 26}" font-family="${sans}" font-size="18" font-style="italic" fill="${t.ink}" opacity="0.92">${esc(l)}</text>`).join("\n")}
<rect x="40" y="300" width="560" height="66" rx="18" fill="${t.chipBg}"/>
<text x="62" y="323" font-family="${sans}" font-size="11" font-weight="600" letter-spacing="3" fill="${t.chipInk}" opacity="0.75">REDEEM CODE</text>
<text x="62" y="352" font-family="${mono}" font-size="26" font-weight="700" letter-spacing="3" fill="${t.chipInk}">${esc(card.code)}</text>
</svg>`;
}

export const giftCardDataUrl = (card: GiftCardData) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(giftCardSvg(card))}`;

async function giftCardPngBlob(card: GiftCardData): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([giftCardSvg(card)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't render the card image."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't render the card image.");
    ctx.drawImage(img, 0, 0, 1280, 800);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Couldn't render the card image.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadGiftCardPng(card: GiftCardData) {
  const blob = await giftCardPngBlob(card);
  const link = document.createElement("a");
  const href = URL.createObjectURL(blob);
  link.href = href;
  link.download = `bowgift-${card.code}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1500);
}

/** True when this browser can share an image file (most phones). */
export function canShareImages() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  try {
    return typeof nav.canShare === "function" && nav.canShare({ files: [new File([""], "x.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/** Opens the phone's share sheet with the gift card image attached (WhatsApp, Telegram, Messages…). */
export async function shareGiftCard(card: GiftCardData) {
  const blob = await giftCardPngBlob(card);
  const file = new File([blob], `bowgift-${card.code}.png`, { type: "image/png" });
  try {
    await navigator.share({ files: [file], title: "BowGift", text: `A BowGift for you! Redeem it on BowPay with code ${card.code}` });
  } catch (err) {
    if ((err as { name?: string })?.name !== "AbortError") throw err;
  }
}
