"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const completeAuth = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error: exchangeError } = await getSupabaseBrowserClient().auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          const {
            data: { session },
          } = await getSupabaseBrowserClient().auth.getSession();
          if (!session) throw new Error("This verification link is invalid or has expired.");
        }
        router.replace("/dashboard");
      } catch (callbackError) {
        setError(callbackError instanceof Error ? callbackError.message : "Unable to complete verification.");
      }
    };

    void completeAuth();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {error || "Completing your email verification…"}
        </p>
        {error && (
          <a href="/login" className="inline-block mt-4 text-sm font-medium text-brand-dark dark:text-brand">
            Return to login
          </a>
        )}
      </div>
    </div>
  );
}