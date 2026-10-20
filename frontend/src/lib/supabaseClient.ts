import { createClient } from "@supabase/supabase-js";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const isValidUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const isConfiguredRef =
  Boolean(rawUrl) &&
  isValidUrl(rawUrl) &&
  !rawUrl.includes("[") &&
  !rawUrl.includes("placeholder");

const supabaseUrl = isConfiguredRef ? rawUrl : "https://project-demo.supabase.co";

const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const isConfiguredKey =
  Boolean(rawKey) &&
  !rawKey.includes("[") &&
  !rawKey.includes("placeholder") &&
  rawKey.length > 20;

const supabaseAnonKey = isConfiguredKey
  ? rawKey
  : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder_anon_token";

/**
 * Supabase Browser Client.
 * Uses only public anonymous key (NEXT_PUBLIC_SUPABASE_ANON_KEY).
 * Service-role keys are never exposed to browser client code.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "fos_auth_token",
  },
});

export const isSupabaseConfigured = (): boolean => {
  return isConfiguredRef && isConfiguredKey;
};
