"use client";

import { Crown, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { roleColor, titleAccent } from "@/lib/roles";
import { useApp } from "./providers";

export function Avatar({
  name,
  src,
  size = 44,
  online,
  ring = true,
}: {
  name: string;
  src?: string | null;
  size?: number;
  online?: boolean;
  ring?: boolean;
}) {
  const inner = src ? (
    <img src={src} alt={name} width={size} height={size} loading="lazy" decoding="async" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className="flex items-center justify-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(140deg,#2f3d59,#1a2438)",
        fontSize: size * 0.38,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
  return (
    <span
      className={ring ? "avatar-ring" : "relative inline-block flex-none"}
      style={{ width: size, height: size }}
    >
      {inner}
      {typeof online === "boolean" ? (
        <span className={`presence ${online ? "presence-on" : ""}`} aria-label={online ? "online" : "offline"} />
      ) : null}
    </span>
  );
}

export function RoleTag({ role, title, size = 12 }: { role: string; title?: string | null; size?: number }) {
  const { t } = useApp();
  const accent = titleAccent(title ?? null);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1">
      <span className="role-tag inline-flex items-center gap-1" style={{ color: roleColor(role), fontSize: size }}>
        {role === "OWNER" ? <Crown size={size} strokeWidth={2.4} aria-hidden="true" /> : null}
        ({t(`role.${role}` as "role.MEMBER")})
      </span>
      {title ? (
        <span className="role-tag" style={{ color: accent ?? "var(--text-2)", fontSize: size }}>
          ({title})
        </span>
      ) : null}
    </span>
  );
}

export function NameWithTag({
  name,
  role,
  title,
  size,
  className = "",
}: {
  name: string;
  role: string;
  title?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${className}`}>
      {name ? (
        <span className="font-semibold" style={{ color: "var(--text)" }}>
          {name}
        </span>
      ) : null}
      <RoleTag role={role} title={title} size={size} />
    </span>
  );
}

export function ScreenHeader({
  title,
  art = "/brand/header.webp",
  right,
  back,
}: {
  title: string;
  art?: string;
  right?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <header className="screen-header chrome">
      <img src={art} alt="" aria-hidden="true" className="screen-header-art" width={900} height={360} />
      <div className="header-shade" />
      <div className="relative flex min-h-[104px] items-center justify-between gap-3 px-3 py-3">
        <div className="flex items-center gap-2">
          {back}
          <h1 className="brush-title text-[34px] sm:text-[38px]">{title}</h1>
        </div>
        {right}
      </div>
    </header>
  );
}

export function HexIcon({ children, size = 46, filled = true }: { children: ReactNode; size?: number; filled?: boolean }) {
  return (
    <span className={filled ? "hex hex-fill" : "hex"} style={{ ["--hex-size" as string]: `${size}px` }}>
      <span className="hex-inner">{children}</span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="g-card-flat flex flex-col items-center gap-2 px-5 py-9 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] text-[var(--electric)]">
        {icon}
      </span>
      <p className="text-[15px] font-semibold">{title}</p>
      {body ? <p className="muted max-w-[290px] text-[13px]">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel: string }) {
  return (
    <div className="g-card-flat flex flex-col items-center gap-3 px-5 py-8 text-center">
      <p className="text-[14px] font-semibold" style={{ color: "var(--danger)" }}>
        {message}
      </p>
      {onRetry ? (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="g-card-flat flex items-center gap-3 p-3">
          <span className="skeleton h-11 w-11 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="skeleton h-3 w-2/5" />
            <span className="skeleton h-3 w-3/5" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative flex h-6 w-11 flex-none items-center rounded-full border transition-colors disabled:opacity-50"
      style={{
        borderColor: checked ? "transparent" : "var(--border)",
        background: checked ? "linear-gradient(100deg,#318BFF,#8B4DFF)" : "var(--surface)",
      }}
    >
      <span
        className="absolute h-4 w-4 rounded-full bg-white transition-transform"
        style={{ transform: checked ? "translateX(22px)" : "translateX(4px)" }}
      />
    </button>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet-panel">
        <div className="sheet-grabber" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button type="button" className="icon-btn h-9 w-9" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  busy,
  danger = true,
  children,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="muted mb-3 text-[13px]">{body}</p>
      {children}
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-ghost flex-1" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn flex-1 ${danger ? "btn-danger" : "btn-primary"}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  id,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="g-card-flat p-3.5">
      {title ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold">{title}</h2>
            {subtitle ? <p className="muted tiny mt-0.5">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function RowLink({
  icon,
  label,
  href,
  hint,
  danger,
}: {
  icon: ReactNode;
  label: string;
  href: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <a
      href={href}
      className="flex min-h-[52px] items-center gap-3 border-b border-[var(--border)] px-1 py-2.5 last:border-b-0"
      style={danger ? { color: "var(--danger)" } : undefined}
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-[var(--electric)]">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        {hint ? <span className="muted tiny block">{hint}</span> : null}
      </span>
      <span aria-hidden="true" className="muted text-[18px] leading-none">
        ›
      </span>
    </a>
  );
}
