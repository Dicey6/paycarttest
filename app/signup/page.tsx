"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoLockup } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button, Field, Input } from "@/components/ui";
import { useAuth } from "@/components/providers";
import { getAuthRedirectUrl, getSupabaseBrowserClient } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && session) router.replace("/dashboard");
  }, [authLoading, router, session]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!draft.trim()) {
      setError("Enter a username — it'll appear on your card.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);

    try {
      const { data, error: signupError } = await getSupabaseBrowserClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: draft.trim() },
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (signupError) throw signupError;

      if (data.session) {
        router.replace("/dashboard");
      } else {
        setMessage("Check your email to verify your account before logging in.");
      }
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Unable to create your account.");
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
          <h1 className="text-2xl font-semibold tracking-tight mb-1.5">Create your account</h1>
          <p className="text-sm mb-7 text-neutral-500 dark:text-neutral-400">
            Set up BowPay in a couple of minutes.
          </p>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field label="Username" hint="This is how you'll appear on your virtual card.">
              <Input
                type="text"
                placeholder="Ren Uchiha"
                value={draft}
                maxLength={24}
                onChange={(e) => setDraft(e.target.value)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password" hint="Use at least 8 characters.">
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </Field>
            <Field label="Confirm password">
              <Input
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>

            {error && <p className="text-xs text-red-500">{error}</p>}
            {message && <p className="text-xs text-brand-dark dark:text-brand">{message}</p>}

            <Button className="w-full py-3" type="submit" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
            {message && (
              <button type="button" onClick={() => void resendVerification()} className="w-full text-xs font-medium text-brand-dark dark:text-brand">
                Resend verification email
              </button>
            )}
            <p className="text-xs text-center text-neutral-400 dark:text-neutral-500">
              By continuing you agree to BowPay&apos;s Terms and Privacy Policy.
            </p>
          </form>

          <div className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-dark dark:text-brand font-medium">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
