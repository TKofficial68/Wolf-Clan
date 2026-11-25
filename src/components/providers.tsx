"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createTranslator, isLocale, type Locale, type MessageKey } from "@/i18n";

export type Theme = "dark" | "light" | "system";
export type AnimationLevel = "full" | "lite";

export type Prefs = {
  theme: Theme;
  language: Locale;
  reduceMotion: boolean;
  animationLevel: AnimationLevel;
};

type ToastKind = "info" | "success" | "error";
type ToastAction = { label: string; onClick: () => void };
type ToastState = { id: number; message: string; kind: ToastKind; action?: ToastAction } | null;

type AppContextValue = {
  prefs: Prefs;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Locale) => void;
  setReduceMotion: (value: boolean) => void;
  setAnimationLevel: (value: AnimationLevel) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  locale: Locale;
  lite: boolean;
  capabilities: string[];
  isOwner: boolean;
  can: (capability: string) => boolean;
  toast: (message: string, kind?: ToastKind, action?: ToastAction) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function detectLite(level: AnimationLevel): boolean {
  if (typeof navigator === "undefined") return false;
  if (level === "lite") return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2;
}

function applyDom(prefs: Prefs, lite: boolean) {
  const root = document.documentElement;
  const resolved = prefs.theme === "system"
    ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    : prefs.theme;
  root.dataset.theme = resolved;
  root.dataset.motion = prefs.reduceMotion ? "reduced" : "full";
  root.dataset.lite = lite ? "true" : "false";
  root.lang = prefs.language;
  document.cookie = `wolf_theme=${prefs.theme}; path=/; max-age=31536000; SameSite=Lax`;
  document.cookie = `wolf_motion=${prefs.reduceMotion ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
  document.cookie = `wolf_anim=${prefs.animationLevel}; path=/; max-age=31536000; SameSite=Lax`;
}

export function Providers({
  children,
  initialPrefs,
  authenticated,
  onboardingCompleted,
  capabilities = [],
  role = "MEMBER",
}: {
  children: ReactNode;
  initialPrefs: Prefs;
  authenticated: boolean;
  onboardingCompleted: boolean;
  capabilities?: string[];
  role?: string;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [toastState, setToastState] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lite, setLite] = useState(false);

  useEffect(() => {
    const computed = detectLite(prefs.animationLevel);
    setLite(computed);
    applyDom(prefs, computed);
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyDom(prefs, computed);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [prefs]);

  const persist = useCallback((patch: Partial<Prefs>) => {
    if (!authenticated) return;
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, [authenticated]);

  const setTheme = useCallback((theme: Theme) => {
    setPrefs((prev) => ({ ...prev, theme }));
    persist({ theme });
  }, [persist]);

  const setLanguage = useCallback((language: Locale) => {
    if (!isLocale(language)) return;
    document.cookie = `wolf_lang=${language}; path=/; max-age=31536000; SameSite=Lax`;
    setPrefs((prev) => ({ ...prev, language }));
    if (!authenticated) return;
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    }).finally(() => router.refresh());
  }, [authenticated, router]);

  const setReduceMotion = useCallback((reduceMotion: boolean) => {
    setPrefs((prev) => ({ ...prev, reduceMotion }));
    persist({ reduceMotion });
  }, [persist]);

  const setAnimationLevel = useCallback((animationLevel: AnimationLevel) => {
    setPrefs((prev) => ({ ...prev, animationLevel }));
    persist({ animationLevel });
  }, [persist]);

  const toast = useCallback((message: string, kind: ToastKind = "info", action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current);
    setToastState({ id: Date.now(), message, kind, action });
    timer.current = setTimeout(() => setToastState(null), action ? 9000 : 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Presence heartbeat while the app is visible.
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    const send = (status: "online" | "offline") => {
      if (stopped) return;
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        keepalive: true,
      });
    };
    send("online");
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") send("online");
    }, 25000);
    const onVisibility = () => send(document.visibilityState === "visible" ? "online" : "offline");
    const onLeave = () => send("offline");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [authenticated]);

  // Tutorial completion is stored locally for guests and synced once to the account.
  useEffect(() => {
    if (!authenticated || onboardingCompleted) return;
    let done = false;
    try {
      done = localStorage.getItem("wolf_tutorial_done") === "1";
    } catch {
      done = false;
    }
    if (done) void fetch("/api/onboarding", { method: "POST" });
  }, [authenticated, onboardingCompleted]);

  // Unread notification count drives the app icon badge where supported.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const refreshBadge = async () => {
      try {
        const response = await fetch("/api/notifications?count=1", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { unread?: number };
        if (cancelled) return;
        const badge = navigator as Navigator & { setAppBadge?: (value: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
        if (data.unread && badge.setAppBadge) await badge.setAppBadge(data.unread);
        if (!data.unread && badge.clearAppBadge) await badge.clearAppBadge();
      } catch {
        undefined;
      }
    };
    void refreshBadge();
    const interval = setInterval(refreshBadge, 45000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authenticated]);

  // Service worker + update-ready notice.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (cancelled) return;
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setToastState({
                id: Date.now(),
                message: prefs.language === "bn" ? "আপডেট প্রস্তুত" : "Update ready",
                kind: "info",
                action: {
                  label: prefs.language === "bn" ? "রিফ্রেশ" : "Refresh",
                  onClick: () => {
                    installing.postMessage({ type: "SKIP_WAITING" });
                    window.location.reload();
                  },
                },
              });
            }
          });
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [prefs.language]);

  const translator = useMemo(
    () => createTranslator(prefs.language),
    [prefs.language],
  );

  const value: AppContextValue = useMemo(
    () => ({
      prefs,
      setTheme,
      setLanguage,
      setReduceMotion,
      setAnimationLevel,
      t: translator,
      locale: prefs.language,
      lite,
      toast,
      capabilities,
      isOwner: role === "OWNER",
      can: (capability: string) => role === "OWNER" || capabilities.includes(capability),
    }),
    [prefs, setTheme, setLanguage, setReduceMotion, setAnimationLevel, translator, lite, toast, capabilities, role],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      {toastState ? (
        <div
          role="status"
          aria-live="polite"
          className={`toast ${toastState.kind === "error" ? "toast-error" : toastState.kind === "success" ? "toast-success" : ""}`}
        >
          <span className="flex-1">{toastState.message}</span>
          {toastState.action ? (
            <button
              type="button"
              className="font-semibold text-[var(--electric)]"
              onClick={() => {
                toastState.action?.onClick();
                setToastState(null);
              }}
            >
              {toastState.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside Providers");
  return ctx;
}
