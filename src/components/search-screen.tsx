"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Search, X } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { useViewer } from "./media-viewer-provider";
import { Avatar, EmptyState, Spinner } from "./ui";
import type { MediaItem } from "@/lib/media-types";
import type { SearchGroup } from "@/app/api/search/route";
import type { MessageKey } from "@/i18n";

const LABELS: Record<string, MessageKey> = {
  members: "search.members",
  messages: "search.messages",
  tasks: "search.tasks",
  projects: "search.projects",
  reviews: "search.reviews",
  files: "search.files",
};

export function SearchScreen({ fileId }: { fileId?: string }) {
  const { t } = useApp();
  const { open } = useViewer();
  const [term, setTerm] = useState("");
  const [groups, setGroups] = useState<SearchGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const run = useCallback(async (value: string) => {
    if (value.trim().length < 2) {
      setGroups(null);
      return;
    }
    setLoading(true);
    const result = await api<{ groups: SearchGroup[] }>(`/api/search?q=${encodeURIComponent(value.trim())}`);
    setLoading(false);
    if (result.ok) {
      setGroups(result.data.groups);
      setError(false);
    } else setError(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void run(term), 300);
    return () => clearTimeout(timer);
  }, [term, run]);

  useEffect(() => {
    if (!fileId) return;
    void api<MediaItem>(`/api/media/meta?id=${fileId}`).then((result) => {
      if (result.ok) open({ title: t("search.files"), items: [result.data], index: 0 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const total = useMemo(() => (groups ?? []).reduce((sum, group) => sum + group.results.length, 0), [groups]);

  return (
    <div className="screen flex flex-col gap-2.5" style={{ paddingTop: "max(10px, env(safe-area-inset-top))" }}>
      <div className="flex items-center gap-2">
        <Link href="/home" className="icon-btn h-9 w-9" aria-label={t("common.back")}>
          <ArrowLeft size={16} />
        </Link>
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-2)]" />
          <input
            autoFocus
            className="field pl-9 pr-9"
            placeholder={t("search.placeholder")}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            aria-label={t("common.search")}
          />
          {term ? (
            <button type="button" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center" aria-label={t("common.close")} onClick={() => setTerm("")}>
              <X size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <p className="muted px-0.5 text-[11px]">{t("search.scope")}</p>
      {loading ? <div className="flex justify-center py-4"><Spinner size={20} /></div> : null}
      {error ? <p className="text-[12px]" style={{ color: "var(--danger)" }}>{t("common.networkError")}</p> : null}
      {groups && total === 0 && !loading ? <EmptyState icon={<Search size={20} />} title={t("search.empty")} body={t("search.placeholder")} /> : null}

      {groups?.filter((group) => group.results.length > 0).map((group) => (
        <section key={group.key} className="flex flex-col gap-1">
          <p className="section-label">{t(LABELS[group.key] ?? "search.members")}</p>
          {group.results.map((result) => (
            <Link key={result.id} href={result.href} className="g-card-flat flex items-center gap-2 p-2.5">
              {group.key === "members" ? (
                <Avatar name={result.title} src={result.avatarUrl ?? null} size={26} />
              ) : (
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[var(--border)] text-[var(--electric)]">
                  <FileText size={12} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">{result.title}</span>
                <span className="muted tiny block truncate">{result.subtitle}</span>
              </span>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
