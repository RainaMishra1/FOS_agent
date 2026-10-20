"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { UserProfile, UserRole } from "@/types";

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

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isSupabaseConfigured();

  // Helper to fetch server-side verified profile from FastAPI
  const fetchProfileFromBackend = useCallback(async (token: string): Promise<UserProfile | null> => {
    try {
      const resp = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (resp.ok) {
        const data: UserProfile = await resp.json();
        return data;
      } else if (resp.status === 401 || resp.status === 403) {
        console.warn(`Auth profile fetch failed with status: ${resp.status}`);
      }
    } catch (err) {
      console.warn("Unable to contact backend auth/me endpoint directly:", err);
    }
    return null;
  }, []);

  // Sync profile based on active session
  const syncProfile = useCallback(async (currentSession: Session | null) => {
    if (!currentSession || !currentSession.user) {
      setUser(null);
      setProfile(null);
      setRole(null);
      return null;
    }

    setUser(currentSession.user);

    // 1. Fetch server-verified profile from FastAPI backend
    const backendProfile = await fetchProfileFromBackend(currentSession.access_token);
    if (backendProfile) {
      setProfile(backendProfile);
      setRole(backendProfile.role);
      return backendProfile;
    }

    // Roles and profile links are authoritative only when returned by the API.
    setProfile(null);
    setRole(null);
    return null;
  }, [fetchProfileFromBackend]);

  // Initial session recovery
  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("Error retrieving Supabase session:", sessionError.message);
          setError(sessionError.message);
        }

        if (mounted) {
          const initialSession = data?.session ?? null;
          setSession(initialSession);
          if (initialSession) {
            await syncProfile(initialSession);
          }
        }
      } catch (err: any) {
        console.error("Unexpected error initializing auth:", err);
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initializeAuth();

    // Listen for auth state changes (sign in, sign out, token refresh, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setError(null);

      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        setRole(null);
        setIsLoading(false);
      } else if (newSession) {
        await syncProfile(newSession);
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncProfile]);

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ error: Error | null; role?: UserRole | null; profile?: UserProfile | null }> => {
    setIsLoading(true);
    setError(null);

    if (!isConfigured) {
      const err = new Error(
        "Supabase is not configured. Please verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment."
      );
      setError(err.message);
      setIsLoading(false);
      return { error: err, role: null };
    }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
        return { error: authError, role: null };
      }

      if (!data.session) {
        const noSessionErr = new Error("No active session returned after authentication.");
        setError(noSessionErr.message);
        setIsLoading(false);
        return { error: noSessionErr, role: null };
      }

      setSession(data.session);
      setUser(data.session.user);

      // Verify and obtain application profile and role through backend
      const resolvedProfile = await syncProfile(data.session);
      setIsLoading(false);

      if (!resolvedProfile) {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        const profileErr = new Error(
          "Authenticated with Supabase, but no FOS application profile found for this user. Please contact an administrator to provision your account."
        );
        setError(profileErr.message);
        return { error: profileErr, role: null };
      }

      return { error: null, role: resolvedProfile.role, profile: resolvedProfile };
    } catch (err: any) {
      const message = err.message || "Failed to sign in. Please try again.";
      setError(message);
      setIsLoading(false);
      return { error: new Error(message), role: null };
    }
  };

  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error during Supabase signOut:", err);
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      setRole(null);
      setIsLoading(false);
    }
  };


  const refreshProfile = async (): Promise<UserProfile | null> => {
    if (!session) return null;
    return await syncProfile(session);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        isLoading,
        error,
        isAuthenticated: Boolean(user && session),
        isConfigured,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
