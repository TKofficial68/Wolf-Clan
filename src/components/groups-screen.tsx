"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MoreHorizontal, Pin, Plus, Search, Star, Users, X } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { Avatar, EmptyState, ErrorState, ListSkeleton, ScreenHeader, Sheet, Spinner } from "./ui";
import { ACCENT_COLORS, GROUP_ACCENTS, GROUP_ICONS, GroupGlyph } from "./group-glyph";
import { WolfMark } from "./wolf-art";
import type { GroupListItem } from "@/app/api/groups/route";

type MemberOption = { id: string; displayName: string; username: string; avatarUrl: string | null; role: string };

export function GroupsScreen({ startCreating = false }: { startCreating?: boolean }) {
  const { t, toast } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<GroupListItem[] | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [error, setError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuGroup, setMenuGroup] = useState<GroupListItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", accent: "blue", icon: "people", memberIds: [] as string[] });
  const [people, setPeople] = useState<MemberOption[]>([]);

  const load = useCallback(async () => {
    const result = await api<{ items: GroupListItem[]; canCreate: boolean }>(`/api/groups?scope=${scope}`);
    if (result.ok) {
      setItems(result.data.items);
      setCanCreate(result.data.canCreate);
      setError(false);
    } else {
      setError(true);
    }
  }, [scope]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (startCreating && canCreate) setCreateOpen(true);
  }, [startCreating, canCreate]);

  useEffect(() => {
    if (!createOpen || people.length) return;
    void api<{ owner: { id: string } | null; members: MemberOption[] }>("/api/home").then((result) => {
      if (result.ok) setPeople(result.data.members as unknown as MemberOption[]);
    });
  }, [createOpen, people.length]);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (!query.trim()) return items;
    const term = query.trim().toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(term) || item.description.toLowerCase().includes(term));
  }, [items, query]);

  const toggle = async (group: GroupListItem, field: "pin" | "favorite") => {
    const value = field === "pin" ? !group.pinned : !group.favorite;
    const result = await api("/api/groups", { method: "POST", body: { action: field, groupId: group.id, value } });
    setMenuGroup(null);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    toast(field === "pin" ? (value ? t("groups.pinnedToast") : t("groups.unpinGroup")) : value ? t("home.favorited") : t("home.unfavorited"), "success");
    await load();
  };

  const createGroup = async () => {
    if (draft.name.trim().length < 2) {
      toast(t("groups.name"), "error");
      return;
    }
    setCreating(true);
    const result = await api<{ id: string }>("/api/groups", { method: "POST", body: { action: "create", ...draft } });
    setCreating(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    setCreateOpen(false);
    setDraft({ name: "", description: "", accent: "blue", icon: "people", memberIds: [] });
    toast(t("groups.created"), "success");
    router.push(`/groups/${result.data.id}`);
  };

  return (
    <>
      <ScreenHeader
        title={t("groups.title")}
        art="/brand/header-group.webp"
        right={
          <button type="button" className="icon-btn" aria-label={t("groups.search")} onClick={() => setSearchOpen((value) => !value)}>
            {searchOpen ? <X size={18} /> : <Search size={18} />}
          </button>
        }
      />
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 10 }}>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[var(--purple)] bg-[var(--card)]">
            <WolfMark size={22} />
          </span>
          <div className="flex flex-1 justify-center">
            <span className="pill cursor-default gap-1.5 text-[12.5px]">
              <Users size={14} /> {scope === "mine" ? t("groups.myGroups") : t("groups.allGroups")}
            </span>
          </div>
          <span className="h-9 w-9 flex-none" />
        </div>

        {searchOpen ? (
          <input
            className="field"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("groups.searchPlaceholder")}
            aria-label={t("groups.search")}
          />
        ) : null}

        {canCreate ? (
          <div className="flex gap-1.5">
            <button type="button" className={`pill flex-1 text-[12px] ${scope === "mine" ? "pill-active" : ""}`} onClick={() => setScope("mine")}>
              {t("groups.myGroups")}
            </button>
            <button type="button" className={`pill flex-1 text-[12px] ${scope === "all" ? "pill-active" : ""}`} onClick={() => setScope("all")}>
              {t("groups.allGroups")}
            </button>
          </div>
        ) : null}

        {error && !items ? <ErrorState message={t("common.networkError")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {!items && !error ? <ListSkeleton rows={5} /> : null}
        {items && filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={query ? t("groups.searchEmpty") : t("groups.emptyTitle")}
            body={query ? t("groups.searchPlaceholder") : t("groups.emptyBody")}
            action={
              canCreate ? (
                <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} /> {t("groups.create")}
                </button>
              ) : undefined
            }
          />
        ) : null}

        {filtered.map((group) => {
          const accent = ACCENT_COLORS[group.accent] ?? ACCENT_COLORS.blue;
          return (
            <div key={group.id} className="g-card g-card-accent streak flex items-center gap-2.5 p-2.5" style={{ ["--accent" as string]: accent }}>
              <span
                className="flex h-12 w-12 flex-none items-center justify-center rounded-[12px]"
                style={{ border: `1.6px solid ${accent}`, color: accent, background: `linear-gradient(150deg, ${accent}22, transparent)` }}
              >
                <GroupGlyph icon={group.icon} size={30} />
              </span>
              <Link href={`/groups/${group.id}`} className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="truncate text-[13.5px] font-bold uppercase tracking-wide">{group.name}</span>
                  <span
                    className="min-w-[20px] rounded-full px-1.5 text-center text-[10.5px] font-bold"
                    style={{ background: group.unread > 0 ? "#ff2f61" : "var(--card-2)", color: group.unread > 0 ? "#fff" : "var(--text-2)" }}
                  >
                    {group.unread}
                  </span>
                </span>
                <span className="muted mt-0.5 flex items-center gap-1 text-[11px]">
                  <Users size={11} /> {t("groups.members", { count: group.memberCount })}
                  {!group.isMember ? <span className="ml-1 opacity-70">· {t("groups.allGroups")}</span> : null}
                </span>
                <span className="muted mt-0.5 line-clamp-2 text-[11.5px] leading-snug">{group.description}</span>
              </Link>
              <div className="flex flex-none flex-col items-center gap-0.5">
                <button type="button" className="muted flex h-8 w-7 items-center justify-center" aria-label={t("groups.groupInfo")} onClick={() => setMenuGroup(group)}>
                  <MoreHorizontal size={16} />
                </button>
                <ChevronRight size={17} className="text-[var(--text-2)]" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>

      {canCreate ? (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="fixed bottom-[calc(104px+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full text-white sm:left-auto sm:right-[calc(50%-230px)] sm:translate-x-0"
          style={{ background: "linear-gradient(140deg,#318BFF,#8B4DFF)" }}
          aria-label={t("groups.create")}
        >
          <Plus size={22} />
        </button>
      ) : null}

      <Sheet open={Boolean(menuGroup)} onClose={() => setMenuGroup(null)} title={menuGroup?.name ?? t("groups.groupInfo")}>
        {menuGroup ? (
          <div className="flex flex-col gap-2">
            <Link href={`/groups/${menuGroup.id}`} className="btn btn-primary justify-start">
              {t("groups.openGroup")}
            </Link>
            <button type="button" className="btn btn-ghost justify-start" onClick={() => void toggle(menuGroup, "pin")}>
              <Pin size={15} /> {menuGroup.pinned ? t("groups.unpinGroup") : t("groups.pinGroup")}
            </button>
            <button type="button" className="btn btn-ghost justify-start" onClick={() => void toggle(menuGroup, "favorite")}>
              <Star size={15} /> {menuGroup.favorite ? t("groups.unfavoriteGroup") : t("groups.favoriteGroup")}
            </button>
            <p className="muted tiny">{menuGroup.description}</p>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={t("groups.createTitle")}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="label" htmlFor="group-name">{t("groups.name")}</label>
            <input id="group-name" className="field" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={60} />
          </div>
          <div>
            <label className="label" htmlFor="group-desc">{t("groups.description")}</label>
            <textarea id="group-desc" className="field" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={200} rows={3} />
          </div>
          <div>
            <span className="label">{t("groups.icon")}</span>
            <div className="flex flex-wrap gap-1.5">
              {GROUP_ICONS.map((icon) => {
                const accent = ACCENT_COLORS[draft.accent] ?? ACCENT_COLORS.blue;
                return (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setDraft({ ...draft, icon })}
                    className="flex h-10 w-10 items-center justify-center rounded-[10px] border"
                    style={{ borderColor: draft.icon === icon ? accent : "var(--border)", color: accent, background: draft.icon === icon ? `${accent}22` : "var(--surface)" }}
                    aria-label={icon}
                  >
                    <GroupGlyph icon={icon} size={22} />
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className="label">{t("groups.accent")}</span>
            <div className="flex flex-wrap gap-1.5">
              {GROUP_ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  aria-label={accent}
                  onClick={() => setDraft({ ...draft, accent })}
                  className="h-8 w-8 rounded-full border-2"
                  style={{ background: ACCENT_COLORS[accent], borderColor: draft.accent === accent ? "#fff" : "transparent" }}
                />
              ))}
            </div>
          </div>
          <div>
            <span className="label">{t("groups.initialMembers")}</span>
            <div className="hide-scroll flex max-h-36 flex-col gap-1 overflow-y-auto">
              {people.map((person) => (
                <label key={person.id} className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[12px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--blue)]"
                    checked={draft.memberIds.includes(person.id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        memberIds: event.target.checked ? [...draft.memberIds, person.id] : draft.memberIds.filter((id) => id !== person.id),
                      })
                    }
                  />
                  <Avatar name={person.displayName} src={person.avatarUrl} size={22} />
                  {person.displayName}
                </label>
              ))}
              {people.length === 0 ? <p className="muted tiny">{t("groups.noneSelected")}</p> : null}
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void createGroup()} disabled={creating}>
            {creating ? <Spinner /> : <Plus size={16} />} {t("groups.create")}
          </button>
        </div>
      </Sheet>
    </>
  );
}
