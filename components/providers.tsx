"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, type Profile } from "@/lib/supabase";
import { WalletsProvider } from "@/components/wallets";

/* --------------------------------- Theme --------------------------------- */

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("bowpay-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("bowpay-theme", theme);
  }, [theme, hydrated]);

  return (
    <ThemeContext.Provider
      value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/* ---------------------------------- Auth ---------------------------------- */

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  error: "",
  refreshProfile: async () => {},
  signOut: async () => {},
});

async function loadProfile(userId: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as Profile | null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | undefined;

    const initialize = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session: currentSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!mounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        if (currentSession?.user) {
          setProfile(await loadProfile(currentSession.user.id));
        }
        setError("");
        const {
          data: { subscription: authSubscription },
        } = supabase.auth.onAuthStateChange((_, nextSession) => {
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          if (!nextSession?.user) {
            setProfile(null);
            setLoading(false);
            return;
          }

          window.setTimeout(async () => {
            try {
              const nextProfile = await loadProfile(nextSession.user.id);
              if (mounted) {
                setProfile(nextProfile);
                setError("");
              }
            } catch (profileError) {
              if (mounted) {
                setError(profileError instanceof Error ? profileError.message : "Unable to load your profile.");
              }
            } finally {
              if (mounted) setLoading(false);
            }
          }, 0);
        });
        subscription = authSubscription;
      } catch (authError) {
        if (mounted) setError(authError instanceof Error ? authError.message : "Unable to load authentication.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void initialize();
    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (!user) return;
    setProfile(await loadProfile(user.id));
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, error, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WalletsProvider>{children}</WalletsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
