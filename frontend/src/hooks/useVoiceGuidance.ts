"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "fos-nav-voice-muted";

/** Spoken turn-by-turn prompts using the browser's built-in speech (free, works offline on most phones). */
export function useVoiceGuidance() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [muted, setMutedState] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MUTE_KEY) === "1";
      setMutedState(saved);
      mutedRef.current = saved;
    } catch {
      // ignore
    }
    if (!supported) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current =
        voices.find((v) => v.lang === "en-IN") ||
        voices.find((v) => v.lang.startsWith("en-IN")) ||
        voices.find((v) => v.lang.startsWith("en-GB")) ||
        voices.find((v) => v.lang.startsWith("en")) ||
        null;
    };
    pick();
    window.speechSynthesis.addEventListener?.("voiceschanged", pick);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", pick);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const speak = useCallback(
    (text: string, { interrupt = true }: { interrupt?: boolean } = {}) => {
      if (!supported || mutedRef.current || !text) return;
      try {
        if (interrupt) window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voiceRef.current?.lang || "en-IN";
        if (voiceRef.current) utterance.voice = voiceRef.current;
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      } catch {
        // speech is best-effort
      }
    },
    [supported]
  );

  const setMuted = useCallback((value: boolean) => {
    mutedRef.current = value;
    setMutedState(value);
    if (value && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    try {
      window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  return { supported, muted, setMuted, speak };
}
