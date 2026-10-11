import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Service-role client. Server only. Bypasses RLS: it is the only thing allowed to credit deposits and settle withdrawals. */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url() || !key) throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Client that acts as the signed-in user (their JWT), so auth.uid() works inside RPCs. */
export function userClient(token: string) {
  return createClient(url(), anon(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await userClient(token).auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, token };
}
