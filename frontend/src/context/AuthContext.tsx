"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { UserProfile, UserRole } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; role?: UserRole | null; profile?: UserProfile | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_BASE_URL = getApiBaseUrl();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();
  const signInInProgressRef = useRef(false);

  const syncProfile = useCallback(async (activeSession: Session | null): Promise<UserProfile | null> => {
    if (!activeSession) {
      setUser(null);
      setProfile(null);
      setRole(null);
      return null;
    }

    setUser(activeSession.user);
    setSession(activeSession);
    let timeoutId: number | undefined;
    try {
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), 4000);
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Profile verification failed (${response.status}).`);
      }
      const verifiedProfile = (await response.json()) as UserProfile;
      if (verifiedProfile.role !== "admin" && verifiedProfile.role !== "agent") {
        throw new Error("Your account does not have an enabled FOS role.");
      }
      setProfile(verifiedProfile);
      setRole(verifiedProfile.role);
      setError(null);
      return verifiedProfile;
    } catch (err: any) {
      setProfile(null);
      setRole(null);
      const message = err?.name === "AbortError"
        ? "Backend profile verification timed out. Please try again."
        : err?.message || "Could not verify your account with the FOS backend.";
      setError(message);
      return null;
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!isConfigured) {
      for (const key of ["fos_local_user", "fos_local_session", "fos_local_profile"]) {
        localStorage.removeItem(key);
      }
      setError("Authentication is not configured. Please contact your administrator.");
      setIsLoading(false);
      return () => { mounted = false; };
    }
    const initialize = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (mounted) await syncProfile(data.session);
      } catch (err: any) {
        if (mounted) setError(err?.message || "Could not restore your sign-in session.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    void initialize();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (!nextSession) {
        setUser(null);
        setProfile(null);
        setRole(null);
        setError(null);
        setIsLoading(false);
      } else {
        setUser(nextSession.user);
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || signInInProgressRef.current) return;
        setIsLoading(true);
        void syncProfile(nextSession).finally(() => setIsLoading(false));
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [syncProfile, isConfigured]);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!isConfigured) throw new Error("Authentication is not configured. Please contact your administrator.");
      signInInProgressRef.current = true;
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      });
      if (authError) throw authError;
      if (!data.session) throw new Error("Sign-in did not return a valid session.");
      const verifiedProfile = await syncProfile(data.session);
      if (!verifiedProfile) {
        await supabase.auth.signOut();
        throw new Error("Authentication succeeded, but your FOS profile could not be verified. Contact an administrator.");
      }
      return { error: null, role: verifiedProfile.role, profile: verifiedProfile };
    } catch (err: any) {
      const signInError = err instanceof Error ? err : new Error("Sign-in failed. Please try again.");
      setError(signInError.message);
      return { error: signInError };
    } finally {
      signInInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try { await supabase.auth.signOut(); }
    finally {
      setUser(null); setSession(null); setProfile(null); setRole(null); setIsLoading(false);
    }
  };

  const refreshProfile = async () => session ? syncProfile(session) : null;

  return (
    <AuthContext.Provider value={{
      user, session, profile, role, isLoading, error,
      isAuthenticated: Boolean(user && session && profile && role),
      isConfigured, signIn, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
