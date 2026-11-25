"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { api, errorKey } from "@/lib/client";
import { useApp } from "./providers";
import { ScreenHeader, Spinner } from "./ui";
import type { MessageKey } from "@/i18n";

const subjects = [
  { value: "problem", label: "contact.problem" as MessageKey },
  { value: "suggestion", label: "contact.suggestion" as MessageKey },
  { value: "question", label: "contact.question" as MessageKey },
  { value: "other", label: "contact.other" as MessageKey },
];

export function ContactForm({ audience }: { audience: "developer" | "owner" }) {
  const { t, toast } = useApp();
  const [subject, setSubject] = useState("problem");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    if (message.trim().length < 10) {
      setStatus(t("contact.tooShort"));
      return;
    }
    setBusy(true);
    const result = await api("/api/contact", { method: "POST", body: { audience, subject, message } });
    setBusy(false);
    if (!result.ok) {
      const key = errorKey(result.data.error, "contact.failed");
      const text =
        result.data.error === "email_not_configured"
          ? t("contact.configMissing")
          : result.data.error === "email_provider_error"
            ? t("contact.failed")
            : t(key as MessageKey);
      setStatus(text);
      toast(text, "error");
      return;
    }
    setMessage("");
    setSubject("problem");
    setStatus(null);
    toast(t("contact.success"), "success");
  };

  return (
    <>
      <ScreenHeader
        title={audience === "developer" ? t("contact.devTitle") : t("contact.ownerTitle")}
        art="/brand/header.webp"
        back={
          <Link href="/menu" className="icon-btn h-9 w-9" aria-label={t("common.back")}>
            <ArrowLeft size={16} />
          </Link>
        }
      />
      <div className="screen" style={{ paddingTop: 14 }}>
        <form className="g-card flex flex-col gap-3 p-4" onSubmit={submit}>
          <p className="muted text-[12.5px] leading-relaxed">
            {audience === "developer" ? t("contact.devIntro") : t("contact.ownerIntro")}
          </p>
          <div>
            <span className="label">{t("contact.subject")}</span>
            <div className="flex flex-wrap gap-1.5">
              {subjects.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`pill text-[12px] ${subject === option.value ? "pill-active" : ""}`}
                  onClick={() => setSubject(option.value)}
                  aria-pressed={subject === option.value}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="contact-message">{t("contact.message")}</label>
            <textarea
              id="contact-message"
              className="field"
              minLength={10}
              maxLength={2000}
              rows={6}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
            <p className="muted tiny mt-1">{message.length}/2000 · {t("contact.messageHint")}</p>
          </div>
          <p className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--text-2)]">
            {t("contact.note")}
          </p>
          {status ? (
            <p role="alert" className="text-[12.5px]" style={{ color: "var(--danger)" }}>
              {status}
            </p>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner /> : <Send size={15} />} {t("contact.send")}
          </button>
        </form>
      </div>
    </>
  );
}
