"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Crown, Medal, Plus, Settings2, Trophy } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { Avatar, ErrorState, ScreenHeader, Sheet, Spinner } from "./ui";
import { GroupGlyph } from "./group-glyph";

type Entry = { rank: number; userId: string; points: number; displayName: string; username: string; role: string; avatarUrl: string | null };
type Board = { game: string; games: string[]; entries: Entry[]; myRank: Entry | null; canManage: boolean; history: { id: string; delta: number; pointsAfter: number; reason: string; game: string; createdAt: string; playerName: string }[] };

const GAME_ICON: Record<string, string> = { Roblox: "other-games", Minecraft: "minecraft", "Free Fire": "freefire" };
const GAME_COLOR: Record<string, string> = { Roblox: "#4FC3FF", Minecraft: "#22C55E", "Free Fire": "#FFC53D" };
const GAME_SLUG: Record<string, string> = { Roblox: "roblox", Minecraft: "minecraft", "Free Fire": "free-fire" };

export function LeaderboardCard({ initialGame = "Roblox" }: { initialGame?: string }) {
  const { t } = useApp();
  const [board, setBoard] = useState<Board | null>(null);
  const [game, setGame] = useState(initialGame);

  useEffect(() => {
    void api<Board>(`/api/leaderboard?game=${encodeURIComponent(game)}`).then((result) => {
      if (result.ok) setBoard(result.data);
    });
  }, [game]);

  const podium = [board?.entries[1], board?.entries[0], board?.entries[2]];

  return (
    <div className="g-card" style={{ borderColor: "rgba(255,197,61,0.45)" }}>
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className="flex items-center gap-1.5">
          <Crown size={15} style={{ color: "var(--gold)" }} />
          <span className="text-[13px] font-bold tracking-wide" style={{ color: "var(--gold)" }}>{t("leaderboard.title").toUpperCase()}</span>
        </span>
        <Link href={`/leaderboard/${GAME_SLUG[game] ?? "roblox"}`} className="muted text-[10.5px] underline">{t("leaderboard.seeAll")}</Link>
      </div>
      <div className="mt-1.5 flex justify-center gap-1.5 px-2">
        {board?.games.map((entry) => (
          <button
            key={entry}
            type="button"
            className={`pill min-h-[26px] px-2 text-[10px] ${game === entry ? "pill-active" : ""}`}
            onClick={() => setGame(entry)}
          >
            <span className="h-3 w-3"><GroupGlyph icon={GAME_ICON[entry] ?? "other-games"} size={12} /></span>
            {entry}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-end justify-center gap-1.5 px-3">
        {podium.map((entry, index) => {
          const place = index === 1 ? 1 : index === 0 ? 2 : 3;
          const color = place === 1 ? "var(--gold)" : place === 2 ? "#C7D2E5" : "#E08B4F";
          return (
            <div key={place} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-bold" style={{ color }}>#{place}</span>
              <span className="rounded-full p-[2px]" style={{ background: place === 1 ? "linear-gradient(140deg,#FFD974,#FF9D2E)" : "var(--border)", transform: place === 1 ? "scale(1.12)" : undefined }}>
                {entry ? (
                  <Avatar name={entry.displayName} src={entry.avatarUrl} size={place === 1 ? 52 : 40} ring={false} />
                ) : (
                  <span className="flex items-center justify-center rounded-full bg-[var(--surface)]" style={{ width: place === 1 ? 52 : 40, height: place === 1 ? 52 : 40 }}>
                    <Trophy size={16} className="opacity-40" />
                  </span>
                )}
              </span>
              <span className="max-w-[80px] truncate text-[10px] font-semibold">{entry ? entry.displayName : t("leaderboard.emptySlot")}</span>
              <span className="text-[9px]" style={{ color }}>{entry ? `${entry.points} ${t("leaderboard.points")}` : "—"}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-col gap-1 px-3 pb-3">
        {(board?.entries ?? []).slice(3, 6).map((entry) => (
          <div key={entry.userId} className="flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
            <span className="w-5 text-[10px] font-bold">#{entry.rank}</span>
            <Avatar name={entry.displayName} src={entry.avatarUrl} size={18} ring={false} />
            <span className="flex-1 truncate text-[11px]">{entry.displayName}</span>
            <span className="text-[10px] font-semibold" style={{ color: GAME_COLOR[game] }}>{entry.points}</span>
          </div>
        ))}
        {board && board.entries.length === 0 ? <p className="muted tiny text-center">{t("leaderboard.noEntries")}</p> : null}
        {board?.myRank && board.myRank.rank > 3 ? (
          <p className="mt-1 self-center rounded-full px-2 py-0.5 text-[10px]" style={{ background: "rgba(255,197,61,0.16)", color: "var(--gold)" }}>
            {t("leaderboard.yourRank", { rank: board.myRank.rank })}
          </p>
        ) : null}
        {board?.canManage ? (
          <Link href="/leaderboard/manage" className="muted mt-1 self-end text-[10.5px] underline">
            <Settings2 size={11} className="mr-1 inline" />{t("leaderboard.manage")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function LeaderboardScreen({ gameSlug = "roblox" }: { gameSlug?: string }) {
  const { t } = useApp();
  const [game, setGame] = useState(gameSlug === "minecraft" ? "Minecraft" : gameSlug === "free-fire" ? "Free Fire" : "Roblox");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const result = await api<Board>(`/api/leaderboard?game=${encodeURIComponent(game)}`);
    if (result.ok) {
      setBoard(result.data);
      setError(false);
    } else setError(true);
  }, [game]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <ScreenHeader
        title={t("leaderboard.title")}
        art="/brand/header-profile.webp"
        back={<Link href="/profile" className="icon-btn h-9 w-9" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>}
        right={board?.canManage ? <Link href="/leaderboard/manage" className="icon-btn" aria-label={t("leaderboard.manage")}><Settings2 size={17} /></Link> : undefined}
      />
      <div className="screen flex flex-col gap-2" style={{ paddingTop: 10 }}>
        <div className="flex gap-1.5">
          {(board?.games ?? ["Roblox", "Minecraft", "Free Fire"]).map((entry) => (
            <button key={entry} type="button" className={`pill flex-1 text-[11.5px] ${game === entry ? "pill-active" : ""}`} onClick={() => setGame(entry)}>{entry}</button>
          ))}
        </div>
        {error ? <ErrorState message={t("common.networkError")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {board?.entries.length === 0 ? (
          <div className="g-card flex flex-col items-center gap-2 p-5 text-center">
            <Crown size={26} style={{ color: "var(--gold)" }} />
            <p className="text-[14px] font-semibold">{t("leaderboard.noEntries")}</p>
          </div>
        ) : null}
        {board?.entries.map((entry) => (
          <Link key={entry.userId} href={`/profile/${entry.userId}`} className="g-card-flat flex items-center gap-2 p-2.5">
            <span className="flex w-7 items-center justify-center text-[12px] font-bold" style={{ color: entry.rank <= 3 ? "var(--gold)" : "var(--text-2)" }}>
              {entry.rank <= 3 ? <Medal size={14} /> : `#${entry.rank}`}
            </span>
            <span className="w-5 text-[11px]">{entry.rank}</span>
            <Avatar name={entry.displayName} src={entry.avatarUrl} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold">{entry.displayName}</span>
              <span className="muted tiny block">{t(`role.${entry.role}` as "role.MEMBER")}</span>
            </span>
            <span className="text-[12px] font-semibold" style={{ color: GAME_COLOR[game] }}>{entry.points} {t("leaderboard.points")}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function LeaderboardManageScreen() {
  const { t, toast } = useApp();
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [game, setGame] = useState("Roblox");
  const [people, setPeople] = useState<{ id: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ id: string; displayName: string } | null>(null);
  const [amount, setAmount] = useState("10");
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<Board>(`/api/leaderboard?game=${encodeURIComponent(game)}`);
    if (result.ok) setBoard(result.data);
  }, [game]);

  useEffect(() => {
    void load();
    void api<{ members: typeof people }>("/api/home").then((result) => {
      if (result.ok) setPeople(result.data.members as unknown as typeof people);
    });
  }, [load]);

  const submit = async () => {
    if (!selected) return;
    if (reason.trim().length < 3) {
      toast(t("leaderboard.reasonRequired"), "error");
      return;
    }
    setBusy(true);
    const result = await api("/api/leaderboard", { method: "POST", body: { action: "update", game, userId: selected.id, mode, amount: Number(amount), reason } });
    setBusy(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    toast(t("leaderboard.saved"), "success");
    setReason("");
    await load();
  };

  const filtered = people.filter((person) => person.displayName.toLowerCase().includes(search.toLowerCase()));

  if (board && !board.canManage) {
    return (
      <div className="screen flex flex-col gap-2 pt-6 text-center">
        <p className="text-[18px] font-bold" style={{ color: "var(--danger)" }}>{t("errors.forbiddenTitle")}</p>
        <p className="muted text-[12.5px]">{t("errors.forbiddenBody")}</p>
        <Link href="/leaderboard/roblox" className="btn btn-primary mt-2 self-center">{t("leaderboard.title")}</Link>
      </div>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("leaderboard.manageTitle")}
        art="/brand/header-profile.webp"
        back={<button type="button" className="icon-btn h-9 w-9" aria-label={t("common.back")} onClick={() => router.push("/leaderboard/roblox")}><ArrowLeft size={16} /></button>}
      />
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 10 }}>
        <div className="flex gap-1.5">
          {["Roblox", "Minecraft", "Free Fire"].map((entry) => (
            <button key={entry} type="button" className={`pill flex-1 text-[11.5px] ${game === entry ? "pill-active" : ""}`} onClick={() => setGame(entry)}>{entry}</button>
          ))}
        </div>

        <div className="g-card p-3">
          <p className="mb-1.5 text-[12.5px] font-semibold">{t("leaderboard.memberSearch")}</p>
          <input className="field mb-1.5" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("leaderboard.memberSearch")} />
          <div className="hide-scroll max-h-36 overflow-y-auto">
            {filtered.slice(0, 20).map((person) => (
              <button
                key={person.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-[8px] px-1.5 py-1 text-left text-[12px]"
                style={{ background: selected?.id === person.id ? "rgba(49,139,255,0.16)" : undefined }}
                onClick={() => setSelected({ id: person.id, displayName: person.displayName })}
              >
                <Avatar name={person.displayName} src={person.avatarUrl} size={20} />
                {person.displayName}
                {selected?.id === person.id ? <span className="ml-auto text-[10px]">✓</span> : null}
              </button>
            ))}
          </div>
          {selected ? <p className="muted tiny mt-1">{t("leaderboard.game")}: {game} · {selected.displayName}</p> : null}
          <div className="mt-2 flex gap-1.5">
            <button type="button" className={`pill min-h-[28px] flex-1 text-[10.5px] ${mode === "delta" ? "pill-active" : ""}`} onClick={() => setMode("delta")}>{t("leaderboard.add")} / {t("leaderboard.subtract")}</button>
            <button type="button" className={`pill min-h-[28px] flex-1 text-[10.5px] ${mode === "set" ? "pill-active" : ""}`} onClick={() => setMode("set")}>{t("leaderboard.set")}</button>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <input className="field" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} aria-label={t("leaderboard.pointsField")} />
            <input className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("leaderboard.reason")} maxLength={200} />
          </div>
          <button type="button" className="btn btn-primary mt-2 w-full" disabled={!selected || busy} onClick={() => void submit()}>
            {busy ? <Spinner /> : <Plus size={14} />} {t("common.save")}
          </button>
        </div>

        <div className="g-card p-3">
          <p className="mb-1.5 text-[12.5px] font-semibold">{t("leaderboard.history")}</p>
          {(board?.history ?? []).length === 0 ? <p className="muted tiny">{t("leaderboard.noEntries")}</p> : null}
          {(board?.history ?? []).map((entry) => (
            <p key={entry.id} className="muted tiny border-b border-[var(--border)] py-1 last:border-b-0">
              <b>{entry.playerName}</b> · {entry.game} · {entry.delta >= 0 ? "+" : ""}{entry.delta} → {entry.pointsAfter} · {entry.reason}
            </p>
          ))}
        </div>

        <div className="g-card p-3">
          {board?.entries.map((entry) => (
            <div key={entry.userId} className="flex items-center gap-2 border-b border-[var(--border)] py-1 last:border-b-0">
              <span className="w-5 text-[10px]">#{entry.rank}</span>
              <Avatar name={entry.displayName} src={entry.avatarUrl} size={20} />
              <span className="flex-1 truncate text-[11.5px]">{entry.displayName}</span>
              <span className="text-[11px] font-semibold">{entry.points}</span>
              <button
                type="button"
                className="muted ml-1 text-[10px] underline"
                onClick={async () => {
                  const result = await api("/api/leaderboard", { method: "POST", body: { action: "remove", game, userId: entry.userId } });
                  if (!result.ok) {
                    toast(t("common.error"), "error");
                    return;
                  }
                  toast(t("leaderboard.removed"), "success");
                  await load();
                }}
              >
                {t("leaderboard.remove")}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
