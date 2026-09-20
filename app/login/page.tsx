"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoLockup } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { getAuthRedirectUrl, getSupabaseBrowserClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && session) router.replace("/dashboard");
  }, [authLoading, router, session]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      router.replace("/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to log in.");
    } finally {
      setSubmitting(false);
    }
  };

  const resendVerification = async () => {
    setError("");
    setMessage("");
    try {
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: getAuthRedirectUrl() },
      });
      if (resendError) throw resendError;
      setMessage("A new verification email has been sent.");
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Unable to resend verification email.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-5 sm:px-8 h-16 flex items-center justify-between">
        <LogoLockup />
        <ThemeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight mb-1.5">Log in to BowPay</h1>
          <p className="text-sm mb-7 text-neutral-500 dark:text-neutral-400">
            Continue to your wallet-funded virtual card.
          </p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field label="Email">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            {error && <p className="text-xs text-red-500">{error}</p>}
            {message && <p className="text-xs text-brand-dark dark:text-brand">{message}</p>}
            <Button className="w-full py-3" type="submit" disabled={submitting}>
              {submitting ? "Logging in…" : "Log in"}
            </Button>
            {error.toLowerCase().includes("confirm") && (
              <button type="button" onClick={() => void resendVerification()} className="w-full text-xs font-medium text-brand-dark dark:text-brand">
                Resend verification email
              </button>
            )}
          </form>

          <div className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-brand-dark dark:text-brand font-medium">
              Create one
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}