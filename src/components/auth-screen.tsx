"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Eye, EyeOff, Globe2, Mail, Moon, Sun } from "lucide-react";
import { api, errorKey } from "@/lib/client";
import { useApp } from "./providers";
import { Spinner } from "./ui";
import { WolfMark } from "./wolf-art";
import type { MessageKey } from "@/i18n";

type Mode = "login" | "register" | "forgot";

export function AuthScreen({ mode }: { mode: Mode }) {
  const { t, locale, setLanguage, prefs, setTheme, toast } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [approvalNotice, setApprovalNotice] = useState(false);

  useEffect(() => {
    const verified = params.get("verified");
    if (verified === "1") toast(t("auth.verifyEmailBody"), "success");
    if (verified === "invalid") toast(t("auth.verifyEmailError"), "error");
  }, [params, t, toast]);

  useEffect(() => {
    if (mode !== "register") return;
    const clean = username.trim().toLowerCase();
    if (clean.length < 3) {
      setUnavailable(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = setTimeout(async () => {
      const result = await api<{ available: boolean; reason?: string }>(`/api/auth/username?u=${encodeURIComponent(clean)}`);
      setChecking(false);
      setUnavailable(result.ok ? !result.data.available : false);
    }, 350);
    return () => clearTimeout(timer);
  }, [username, mode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    const path = mode === "login" ? "login" : mode === "register" ? "register" : "forgot";
    const result = await api<{ needsVerification?: boolean; needsApproval?: boolean; redirect?: string; reason?: string }>(`/api/auth/${path}`, {
      method: "POST",
      body:
        mode === "login"
          ? { email, password }
          : mode === "register"
            ? { email, password, confirmPassword, displayName, username, inviteCode }
            : { email },
    });
    setBusy(false);

    if (mode === "forgot") {
      if (result.ok) {
        setSent(true);
      } else {
        setMessage(t(errorKey(result.data.error, "auth.emailNotConfigured") as MessageKey));
      }
      return;
    }

    if (!result.ok) {
      if (result.data.error === "banned") {
        router.push("/blocked");
        return;
      }
      setMessage(t(errorKey(result.data.error, "common.error") as MessageKey));
      return;
    }

    if (mode === "register" && result.data.needsApproval) {
      setApprovalNotice(true);
      return;
    }
    if (mode === "register" && result.data.needsVerification) {
      setVerifyNotice(true);
      return;
    }
    toast(mode === "login" ? t("auth.welcomeBack") : t("auth.accountCreated"), "success");
    router.push(result.data.redirect ?? "/home");
  };

  const title = mode === "login" ? t("auth.loginTitle") : mode === "register" ? t("auth.registerTitle") : t("auth.resetPassword");

  return (
    <div className="app-frame chrome">
      <div className="app-body">
        <div className="flex items-center justify-between px-3 pt-[max(12px,env(safe-area-inset-top))]">
          <Link href={mode === "login" ? "/" : "/login"} className="icon-btn h-9 w-9" aria-label={t("common.back")}>
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="icon-btn h-9 w-9"
              aria-label={t("settings.language")}
              onClick={() => setLanguage(locale === "en" ? "bn" : "en")}
            >
              <Globe2 size={15} />
            </button>
            <button
              type="button"
              className="icon-btn h-9 w-9"
              aria-label={t("settings.theme")}
              onClick={() => setTheme(prefs.theme === "dark" ? "light" : "dark")}
            >
              {prefs.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 px-4 pb-10 pt-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <span
              className="relative flex h-[74px] w-[74px] items-center justify-center overflow-hidden rounded-full"
              style={{ border: "1.6px solid transparent", background: "linear-gradient(#0d1522,#0d1522) padding-box, var(--border-grad) border-box" }}
            >
              <img src="/brand/wolf-mark.png" alt="" width={74} height={74} className="h-full w-full object-cover opacity-90" />
            </span>
            <div>
              <p className="brush-title text-[30px]">{t("common.appName")}</p>
              <p className="muted text-[12px]">{t("auth.tagline")}</p>
            </div>
          </div>

          <form onSubmit={submit} className="g-card flex flex-col gap-3 p-4">
            <h1 className="text-[17px] font-semibold">{title}</h1>
            <p className="muted text-[12.5px]">
              {mode === "login" ? t("auth.loginSubtitle") : mode === "register" ? t("auth.registerSubtitle") : t("auth.resetSent")}
            </p>

            {verifyNotice ? (
              <div className="rounded-[12px] border border-[rgba(34,197,94,0.45)] bg-[rgba(34,197,94,0.08)] p-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--success)" }}>
                  <Check size={15} /> {t("auth.checkEmailTitle")}
                </p>
                <p className="muted tiny mt-1">{t("auth.checkEmailBody", { email })}</p>
                <Link href="/login" className="btn btn-ghost mt-2 w-full">
                  {t("auth.login")}
                </Link>
              </div>
            ) : null}

            {sent ? (
              <div className="rounded-[12px] border border-[rgba(49,139,255,0.4)] bg-[rgba(49,139,255,0.08)] p-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--electric)" }}>
                  <Mail size={15} /> {t("auth.checkEmailTitle")}
                </p>
                <p className="muted tiny mt-1">{t("auth.resetSent")}</p>
              </div>
            ) : null}

            {approvalNotice ? (
              <div className="rounded-[12px] border border-[rgba(245,158,11,0.5)] bg-[rgba(245,158,11,0.08)] p-3">
                <p className="text-[13px] font-semibold" style={{ color: "var(--warning)" }}>{t("auth.pendingApprovalTitle")}</p>
                <p className="muted tiny mt-1">{t("auth.pendingApprovalBody")}</p>
                <Link href="/login" className="btn btn-ghost mt-2 w-full">{t("auth.login")}</Link>
              </div>
            ) : null}

            {!verifyNotice && !approvalNotice ? (
              <>
                {mode === "register" ? (
                  <>
                    <div>
                      <label className="label" htmlFor="displayName">{t("auth.displayName")}</label>
                      <input id="displayName" className="field" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={32} />
                    </div>
                    <div>
                      <label className="label" htmlFor="username">{t("auth.username")}</label>
                      <input
                        id="username"
                        className="field"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase())}
                        required
                        minLength={3}
                        maxLength={20}
                        pattern="[a-z0-9._]{3,20}"
                      />
                      <p className="muted tiny mt-1">
                        {checking ? t("auth.usernameChecking") : unavailable ? (
                          <span style={{ color: "var(--danger)" }}>{t("auth.usernameTaken")}</span>
                        ) : username.length >= 3 ? (
                          <span style={{ color: "var(--success)" }}>{t("auth.usernameAvailable")}</span>
                        ) : (
                          t("auth.usernameHint")
                        )}
                      </p>
                    </div>
                  </>
                ) : null}

                <div>
                  <label className="label" htmlFor="email">{t("auth.email")}</label>
                  <input id="email" type="email" className="field" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>

                {mode !== "forgot" ? (
                  <div>
                    <label className="label" htmlFor="password">{t("auth.password")}</label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        className="field pr-11"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={mode === "register" ? 8 : 1}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-0 top-0 flex h-[46px] w-11 items-center justify-center text-[var(--text-2)]"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                ) : null}

                {mode === "register" ? (
                  <div>
                    <label className="label" htmlFor="invite">{t("auth.inviteCode")}</label>
                    <input
                      id="invite"
                      className="field"
                      value={inviteCode}
                      onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                      placeholder={t("auth.inviteCode")}
                      autoComplete="off"
                    />
                    <p className="muted tiny mt-1">{t("auth.inviteRequired")}</p>
                  </div>
                ) : null}

                {mode === "register" ? (
                  <div>
                    <label className="label" htmlFor="confirm">{t("auth.confirmPassword")}</label>
                    <input
                      id="confirm"
                      type={showPassword ? "text" : "password"}
                      className="field"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                ) : null}

                {message ? (
                  <p role="alert" className="rounded-[10px] border border-[rgba(239,68,68,0.45)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-[12.5px]" style={{ color: "var(--danger)" }}>
                    {message}
                  </p>
                ) : null}

                <button type="submit" className="btn btn-primary mt-1" disabled={busy || checking || unavailable}>
                  {busy ? <Spinner /> : null}
                  {mode === "login" ? t("auth.login") : mode === "register" ? t("auth.register") : t("auth.sendResetLink")}
                </button>
              </>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
              {mode === "login" ? (
                <>
                  <Link href="/forgot-password" className="text-[var(--electric)]">
                    {t("auth.forgotPassword")}
                  </Link>
                  <span className="muted">
                    {t("auth.noAccount")}{" "}
                    <Link href="/register" className="font-semibold text-[var(--electric)]">
                      {t("auth.register")}
                    </Link>
                  </span>
                </>
              ) : mode === "register" ? (
                <span className="muted">
                  {t("auth.haveAccount")}{" "}
                  <Link href="/login" className="font-semibold text-[var(--electric)]">
                    {t("auth.login")}
                  </Link>
                </span>
              ) : (
                <Link href="/login" className="font-semibold text-[var(--electric)]">
                  {t("auth.login")}
                </Link>
              )}
            </div>
          </form>

          <p className="muted flex items-center justify-center gap-1.5 text-center text-[11px]">
            <WolfMark size={14} /> {t("auth.developedBy")} · v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordScreen({ token }: { token: string }) {
  const { t, toast } = useApp();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await api("/api/auth/reset", { method: "POST", body: { token, password, confirmPassword } });
    setBusy(false);
    if (!result.ok) {
      setMessage(t(errorKey(result.data.error, "common.error") as MessageKey));
      return;
    }
    toast(t("auth.resetSuccess"), "success");
    router.push("/login");
  };

  return (
    <div className="app-frame chrome">
      <div className="app-body">
        <div className="flex flex-1 flex-col gap-3 px-4 pb-10 pt-[max(20px,env(safe-area-inset-top))]">
          <p className="brush-title text-[30px]">{t("auth.resetPassword")}</p>
          <form className="g-card flex flex-col gap-3 p-4" onSubmit={submit}>
            <div>
              <label className="label" htmlFor="new-password">{t("settings.newPassword")}</label>
              <input id="new-password" type="password" className="field" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="new-confirm">{t("settings.confirmNewPassword")}</label>
              <input id="new-confirm" type="password" className="field" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            {message ? <p role="alert" className="text-[12.5px]" style={{ color: "var(--danger)" }}>{message}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <Spinner /> : null} {t("auth.resetPassword")}
            </button>
            <Link href="/login" className="muted text-center text-[12.5px]">
              {t("auth.login")}
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
