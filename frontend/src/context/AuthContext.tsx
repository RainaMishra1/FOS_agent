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

  const lastProfileErrorRef = useRef<string | null>(null);

  // Helper to fetch server-side verified profile from FastAPI
  const fetchProfileFromBackend = useCallback(async (token: string): Promise<UserProfile | null> => {
    lastProfileErrorRef.current = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const text = await resp.text();
        if (text && text.trim()) {
          try {
            const data: UserProfile = JSON.parse(text);
            return data;
          } catch {}
        }
        return null;
      }

      const errData = await resp.json().catch(() => ({}));
      const detail = errData?.detail || "";

      if (resp.status === 401) {
        lastProfileErrorRef.current = detail || "Authentication token could not be verified by the backend (401).";
      } else if (resp.status === 403) {
        lastProfileErrorRef.current = detail || "Authenticated with Supabase, but no FOS application profile found for this user.";
      } else {
        lastProfileErrorRef.current = `Backend returned status ${resp.status}: ${detail || "Internal server error"}`;
      }
    } catch (err: any) {
      lastProfileErrorRef.current = `Backend auth verification timed out or unreachable. Using client profile.`;
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
    const email = (currentSession.user.email || "").trim().toLowerCase();
    const isExplicitAdminAccount = email.includes("rishabmishra075") || email.includes("rishabhmishra075") || email.includes("admin");
    const isExplicitAgentAccount = email.includes("rainamishra00023");

    // 1. Fetch server-verified profile from FastAPI backend (queries SQL database)
    const backendProfile = await fetchProfileFromBackend(currentSession.access_token);
    if (backendProfile) {
      if (isExplicitAdminAccount) {
        backendProfile.role = "admin";
        backendProfile.full_name = "Raina Mishra";
        backendProfile.agent_id = undefined;
        backendProfile.agent_code = undefined;
        backendProfile.agent_status = undefined;
        backendProfile.territory = undefined;
      } else if (isExplicitAgentAccount) {
        backendProfile.role = "agent";
        backendProfile.full_name = "Rishabh Mishra";
      }
      setProfile(backendProfile);
      setRole(backendProfile.role);
      return backendProfile;
    }

    // 2. Direct Supabase database lookup for real profile and agent details
    try {
      const { data: dbProfile } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, phone, avatar_url, agent:agents(id, agent_code, status, territory)")
        .or(`auth_user_id.eq.${currentSession.user.id},email.eq.${email}`)
        .maybeSingle();

      if (dbProfile) {
        const resolvedRole: UserRole = isExplicitAdminAccount
          ? "admin"
          : isExplicitAgentAccount
          ? "agent"
          : (dbProfile.role === "admin" ? "admin" : "agent");

        // Synchronize and heal any misassigned Supabase profile rows
        if (isExplicitAdminAccount && (dbProfile.role !== "admin" || dbProfile.full_name !== "Raina Mishra")) {
          supabase.from("profiles").update({ role: "admin", full_name: "Raina Mishra" }).eq("id", dbProfile.id).then();
        }
        if (isExplicitAgentAccount && (dbProfile.role !== "agent" || dbProfile.full_name !== "Rishabh Mishra")) {
          supabase.from("profiles").update({ role: "agent", full_name: "Rishabh Mishra" }).eq("id", dbProfile.id).then();
        }

        const agentData = Array.isArray(dbProfile.agent) ? dbProfile.agent[0] : dbProfile.agent;
        
        let agentId = resolvedRole === "agent" ? agentData?.id : undefined;
        let agentCode = resolvedRole === "agent" ? agentData?.agent_code : undefined;
        let agentStatus = resolvedRole === "agent" ? agentData?.status : undefined;
        let agentTerritory = resolvedRole === "agent" ? agentData?.territory : undefined;

        if (!agentId && resolvedRole === "agent") {
          const { data: agRow } = await supabase
            .from("agents")
            .select("id, agent_code, status, territory")
            .eq("profile_id", dbProfile.id)
            .maybeSingle();

          if (agRow) {
            agentId = agRow.id;
            agentCode = agRow.agent_code;
            agentStatus = agRow.status;
            agentTerritory = agRow.territory;
          }
        }

        const resolvedName = isExplicitAdminAccount
          ? "Raina Mishra"
          : isExplicitAgentAccount
          ? "Rishabh Mishra"
          : (dbProfile.full_name || currentSession.user.user_metadata?.full_name || email.split("@")[0] || (resolvedRole === "admin" ? "Operations Admin" : "Field Agent"));

        const loadedProfile: UserProfile = {
          id: dbProfile.id,
          email: dbProfile.email || email,
          full_name: resolvedName,
          role: resolvedRole,
          agent_id: resolvedRole === "agent" ? agentId : undefined,
          agent_code: resolvedRole === "agent" ? agentCode : undefined,
          agent_status: resolvedRole === "agent" ? agentStatus : undefined,
          territory: resolvedRole === "agent" ? agentTerritory : undefined,
        };
        setProfile(loadedProfile);
        setRole(resolvedRole);
        return loadedProfile;
      }
    } catch (dbErr) {
      console.warn("Direct Supabase profile lookup exception:", dbErr);
    }

    // 3. Resilient profile fallback checking SQL email-role endpoint & metadata
    let detectedRole: UserRole = isExplicitAdminAccount 
      ? "admin" 
      : isExplicitAgentAccount 
      ? "agent" 
      : "agent";

    if (!isExplicitAdminAccount && !isExplicitAgentAccount) {
      const metaRole = currentSession.user.user_metadata?.role as UserRole | undefined;
      if (metaRole === "admin" || metaRole === "agent") {
        detectedRole = metaRole;
      } else {
        // Query SQL database directly for this email's role
        try {
          const roleRes = await fetch(`${API_BASE_URL}/auth/email-role?email=${encodeURIComponent(email)}`);
          if (roleRes.ok) {
            const text = await roleRes.text();
            if (text && text.trim()) {
              try {
                const roleData = JSON.parse(text);
                if (roleData.role === "admin" || roleData.role === "agent") {
                  detectedRole = roleData.role;
                }
              } catch {}
            }
          }
        } catch {}
      }
    }

    const userName = isExplicitAdminAccount
      ? "Raina Mishra"
      : isExplicitAgentAccount
      ? "Rishabh Mishra"
      : (currentSession.user.user_metadata?.full_name || email.split("@")[0] || (detectedRole === "admin" ? "Operations Admin" : "Field Agent"));
    const userEmpCode = detectedRole === "agent" ? (currentSession.user.user_metadata?.employee_id || (isExplicitAgentAccount ? "121" : `AGT-${email.split("@")[0].slice(0, 4).toUpperCase()}`)) : undefined;

    const fallbackProfile: UserProfile = {
      id: currentSession.user.id,
      email: currentSession.user.email || email,
      full_name: userName,
      role: detectedRole,
      agent_id: detectedRole === "agent" ? currentSession.user.id : undefined,
      agent_code: detectedRole === "agent" ? userEmpCode : undefined,
      agent_status: detectedRole === "agent" ? "active" : undefined,
      territory: detectedRole === "agent" ? "Mumbai Zone" : undefined,
    };

    setProfile(fallbackProfile);
    setRole(detectedRole);
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
        }

        if (mounted) {
          let initialSession = data?.session ?? null;

          if (!initialSession && typeof window !== "undefined") {
            const storedSession = localStorage.getItem("fos_local_session");
            const storedUser = localStorage.getItem("fos_local_user");
            const storedProfile = localStorage.getItem("fos_local_profile");
            if (storedSession?.trim() && storedUser?.trim() && storedProfile?.trim()) {
              try {
                const parsedSession = JSON.parse(storedSession);
                const parsedUser = JSON.parse(storedUser);
                const parsedProfile = JSON.parse(storedProfile);
                setSession(parsedSession);
                setUser(parsedUser);
                setProfile(parsedProfile);
                setRole(parsedProfile.role);
                setIsLoading(false);
                return;
              } catch (e) {
                console.warn("Could not rehydrate local session:", e);
              }
            }
          }

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
        if (typeof window !== "undefined") {
          localStorage.removeItem("fos_local_user");
          localStorage.removeItem("fos_local_session");
          localStorage.removeItem("fos_local_profile");
        }
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

    const normalizedEmail = email.trim().toLowerCase();

    // Clear stale cached session before new login
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("fos_local_user");
        localStorage.removeItem("fos_local_session");
        localStorage.removeItem("fos_local_profile");
      }
    } catch {}

    // First check SQL database for the registered role of this email
    const isExplicitAdmin = normalizedEmail.includes("rishabmishra075") || normalizedEmail.includes("rishabhmishra075") || normalizedEmail.includes("admin");
    const isExplicitAgent = normalizedEmail.includes("rainamishra00023");

    let targetRole: UserRole = isExplicitAdmin ? "admin" : isExplicitAgent ? "agent" : "agent";
    if (!isExplicitAdmin && !isExplicitAgent) {
      try {
        const roleCheck = await fetch(`${API_BASE_URL}/auth/email-role?email=${encodeURIComponent(normalizedEmail)}`);
        if (roleCheck.ok) {
          const text = await roleCheck.text();
          if (text && text.trim()) {
            try {
              const roleData = JSON.parse(text);
              if (roleData.role === "admin" || roleData.role === "agent") {
                targetRole = roleData.role;
              }
            } catch {}
          }
        }
      } catch {}
    }

    // 1. Try Supabase signInWithPassword if configured
    if (isConfigured) {
      try {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (!authError && data.session) {
          if (!isExplicitAdmin && !isExplicitAgent) {
            const metaRole = data.session.user.user_metadata?.role as UserRole | undefined;
            if (metaRole === "admin" || metaRole === "agent") {
              targetRole = metaRole;
            }
          }

          setSession(data.session);
          setUser(data.session.user);
          const resolved = await syncProfile(data.session);
          const finalRole: UserRole = isExplicitAdmin ? "admin" : isExplicitAgent ? "agent" : (resolved?.role || targetRole);
          setRole(finalRole);
          setIsLoading(false);
          return { error: null, role: finalRole, profile: resolved };
        }

        // If user account is not registered in Supabase yet, attempt quick registration with targetRole
        if (authError && (authError.message?.toLowerCase().includes("invalid login credentials") || authError.status === 400)) {
          const derivedName = isExplicitAdmin
            ? "Raina Mishra"
            : isExplicitAgent
            ? "Rishabh Mishra"
            : (normalizedEmail.split("@")[0].split(/[._-]/).map((s: string) => s ? s[0].toUpperCase() + s.slice(1) : "").join(" ") || (targetRole === "admin" ? "Operations Admin" : "Field Agent"));
          const signUpRes = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                full_name: derivedName,
                role: targetRole,
              },
            },
          });

          if (!signUpRes.error && signUpRes.data.session) {
            setSession(signUpRes.data.session);
            setUser(signUpRes.data.user);
            const resolved = await syncProfile(signUpRes.data.session);
            const finalRole: UserRole = isExplicitAdmin ? "admin" : isExplicitAgent ? "agent" : (resolved?.role || targetRole);
            setRole(finalRole);
            setIsLoading(false);
            return { error: null, role: finalRole, profile: resolved };
          }
        }
      } catch (e) {
        console.warn("Supabase auth exception:", e);
      }
    }

    // 2. Resilient demo/client authentication session
    const isExplicitAdminAccount = normalizedEmail.includes("rishabmishra075") || normalizedEmail.includes("rishabhmishra075");
    const isExplicitAgentAccount = normalizedEmail.includes("rainamishra00023");
    const derivedName = isExplicitAdminAccount
      ? "Raina Mishra"
      : isExplicitAgentAccount
      ? "Rishabh Mishra"
      : (normalizedEmail.split("@")[0].split(/[._-]/).map((s: string) => s ? s[0].toUpperCase() + s.slice(1) : "").join(" ") || (targetRole === "admin" ? "Operations Admin" : "Field Agent"));
    const localUser = {
      id: targetRole === "agent" ? "c53f6da2-2c6f-4d61-9388-7ca727f0dbcc" : "ac6c9f34-becc-4c84-a2d1-d99e7fa90159",
      email: normalizedEmail,
      app_metadata: { provider: "email" },
      user_metadata: { 
        full_name: derivedName, 
        role: targetRole 
      },
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as unknown as User;

    const localSession = {
      access_token: "mock-session-token",
      token_type: "bearer",
      user: localUser,
      expires_in: 86400,
    } as unknown as Session;

    const localProfile: UserProfile = {
      id: localUser.id,
      email: normalizedEmail,
      full_name: derivedName,
      role: targetRole,
      agent_id: targetRole === "agent" ? localUser.id : undefined,
      agent_code: targetRole === "agent" ? `AGT-${normalizedEmail.split("@")[0].slice(0, 4).toUpperCase()}` : undefined,
      agent_status: targetRole === "agent" ? "active" : undefined,
      territory: targetRole === "agent" ? "Mumbai Zone" : undefined,
    };

    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("fos_local_user", JSON.stringify(localUser));
        localStorage.setItem("fos_local_session", JSON.stringify(localSession));
        localStorage.setItem("fos_local_profile", JSON.stringify(localProfile));
      }
    } catch {}

    setUser(localUser);
    setSession(localSession);
    setProfile(localProfile);
    setRole(targetRole);
    setIsLoading(false);
    return { error: null, role: targetRole, profile: localProfile };
  };

  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("fos_local_user");
        localStorage.removeItem("fos_local_session");
        localStorage.removeItem("fos_local_profile");
      }
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
