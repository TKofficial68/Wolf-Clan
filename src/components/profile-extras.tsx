"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { GroupGlyph } from "./group-glyph";
import { LeaderboardCard } from "./leaderboard";

const GAMES = [
  { name: "Roblox", icon: "other-games", color: "#4FC3FF", slug: "roblox" },
  { name: "Minecraft", icon: "minecraft", color: "#22C55E", slug: "minecraft" },
  { name: "Free Fire", icon: "freefire", color: "#FFC53D", slug: "free-fire" },
];

export function ProfileExtras() {
  const { t } = useApp();
  const [game, setGame] = useState("Roblox");
  const [live, setLive] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    void api<{ live: { id: string; title: string }[] }>("/api/meetings").then((result) => {
      if (result.ok) setLive(result.data.live[0] ?? null);
    });
  }, []);

  return (
    <div className="flex flex-col gap-2.5">
      <Link
        href={live ? `/meetings/${live.id}` : "/meetings"}
        className="g-card flex items-center gap-2.5 p-3"
        style={{ background: "linear-gradient(100deg, rgba(139,77,255,0.22), rgba(49,139,255,0.12))" }}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "linear-gradient(140deg,#8B4DFF,#D946EF)" }}>
          <Radio size={17} className="text-white" />
        </span>
        <span className="flex-1">
          <span className="block text-[13.5px] font-semibold">{t("profile.liveMeeting")}</span>
          <span className="muted tiny block">{live ? live.title : t("meetings.upcoming")}</span>
        </span>
        {live ? <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold text-white" style={{ background: "#ff2f61", animation: "pulse-dot 1.8s infinite" }}>LIVE</span> : null}
        <span aria-hidden="true" className="muted">›</span>
      </Link>

      <div className="flex gap-1.5">
        {GAMES.map((entry) => (
          <button
            key={entry.name}
            type="button"
            onClick={() => setGame(entry.name)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[11px] font-semibold"
            style={{
              border: `1.3px solid ${entry.color}`,
              color: game === entry.name ? "#fff" : entry.color,
              background: game === entry.name ? `linear-gradient(120deg, ${entry.color}55, rgba(139,77,255,0.35))` : "var(--card)",
            }}
            aria-pressed={game === entry.name}
          >
            <span className="h-4 w-4"><GroupGlyph icon={entry.icon} size={16} /></span>
            {entry.name}
          </button>
        ))}
      </div>

      <LeaderboardCard initialGame={game} />
    </div>
  );
}
