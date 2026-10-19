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
  signIn: (email: string, password: string) => Promise<{ error: Error | null; role?: UserRole | null }>;
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

    // 2. Client-side fallback from Supabase user_metadata if backend is offline
    const metadataRole = (currentSession.user.user_metadata?.role ||
      currentSession.user.app_metadata?.role ||
      "agent") as UserRole;

    const fallbackProfile: UserProfile = {
      id: currentSession.user.id,
      full_name:
        currentSession.user.user_metadata?.full_name ||
        currentSession.user.email?.split("@")[0] ||
        "Authenticated User",
      email: currentSession.user.email,
      role: metadataRole,
      phone: currentSession.user.phone,
    };

    setProfile(fallbackProfile);
    setRole(metadataRole);
    return fallbackProfile;
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
          } else if (!isConfigured && typeof window !== "undefined") {
            const devRole = localStorage.getItem("fos_dev_auth_role") as UserRole | null;
            const devEmail = localStorage.getItem("fos_dev_auth_email");
            if (devRole && devEmail) {
              const devUser: any = {
                id: devRole === "admin" ? "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000002",
                email: devEmail,
                user_metadata: {
                  full_name: devRole === "admin" ? "Anil Ops (Admin)" : "Field Agent Marcus",
                  role: devRole,
                },
              };
              const devSession: any = { access_token: "dev-sandbox-token", user: devUser };
              setUser(devUser);
              setSession(devSession);
              setProfile({
                id: devUser.id,
                full_name: devUser.user_metadata.full_name,
                email: devEmail,
                role: devRole,
              });
              setRole(devRole);
            }
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
  ): Promise<{ error: Error | null; role?: UserRole | null }> => {
    setIsLoading(true);
    setError(null);

    // If Supabase project is configured, authenticate directly via Supabase Auth
    if (isConfigured) {
      try {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          setError(authError.message);
          setIsLoading(false);
          return { error: authError };
        }

        if (data.session) {
          setSession(data.session);
          const resolvedProfile = await syncProfile(data.session);
          setIsLoading(false);
          return { error: null, role: resolvedProfile?.role || "agent" };
        }

        setIsLoading(false);
        return { error: null };
      } catch (err: any) {
        setError(err.message || "Failed to sign in");
        setIsLoading(false);
        return { error: err };
      }
    } else {
      // In development sandbox mode (when .env.local has placeholders):
      // Enable developer evaluation of role redirection and protected routes
      await new Promise((r) => setTimeout(r, 600)); // Simulate network check
      const lowerEmail = email.toLowerCase();
      const mockRole: UserRole = lowerEmail.includes("admin") ? "admin" : "agent";

      const mockUser: any = {
        id: mockRole === "admin" ? "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000002",
        email,
        user_metadata: {
          full_name: mockRole === "admin" ? "Anil Ops (Admin)" : "Field Agent Marcus",
          role: mockRole,
        },
      };

      const mockSession: any = {
        access_token: "dev-sandbox-token",
        user: mockUser,
      };

      const devProfile: UserProfile = {
        id: mockUser.id,
        full_name: mockUser.user_metadata.full_name,
        email,
        role: mockRole,
        agent_id: mockRole === "agent" ? "agt-001" : undefined,
        agent_code: mockRole === "agent" ? "AGT-101" : undefined,
      };

      setUser(mockUser);
      setSession(mockSession);
      setProfile(devProfile);
      setRole(mockRole);
      setIsLoading(false);

      try {
        localStorage.setItem("fos_dev_auth_role", mockRole);
        localStorage.setItem("fos_dev_auth_email", email);
      } catch {}

      return { error: null, role: mockRole };
    }
  };


  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error during Supabase signOut:", err);
    } finally {
      try {
        localStorage.removeItem("fos_dev_auth_role");
        localStorage.removeItem("fos_dev_auth_email");
      } catch {}
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
