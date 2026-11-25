"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Link2, Mic, MicOff, Monitor, MoreVertical, PhoneOff, Plus, Search, UserX, Users, Video } from "lucide-react";
import { api } from "@/lib/client";
import { useApp } from "./providers";
import { Avatar, EmptyState, ErrorState, ListSkeleton, NameWithTag, ScreenHeader, Sheet, Spinner } from "./ui";
import { PermanentDeleteDialog } from "./permanent-delete";
import { formatDateTime } from "@/lib/time";

type MeetingItem = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  locked: boolean;
  groupId: string | null;
  hostName: string;
  hostAvatarUrl: string | null;
  participantCount: number;
  canHost: boolean;
};

export function MeetingsScreen({ groupId = null, startCreating = false, embedded = false }: { groupId?: string | null; startCreating?: boolean; embedded?: boolean }) {
  const { t, toast, locale } = useApp();
  const router = useRouter();
  const [data, setData] = useState<{ live: MeetingItem[]; upcoming: MeetingItem[]; past: MeetingItem[]; configured: boolean; canCreate: boolean } | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"live" | "upcoming" | "past">("live");
  const [createOpen, setCreateOpen] = useState(false);
  const [hostMenu, setHostMenu] = useState<MeetingItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MeetingItem | null>(null);

  const load = useCallback(async () => {
    const result = await api<{ live: MeetingItem[]; upcoming: MeetingItem[]; past: MeetingItem[]; configured: boolean; canCreate: boolean }>("/api/meetings");
    if (result.ok) {
      setData(result.data);
      setError(false);
    } else setError(true);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (startCreating && data?.canCreate) setCreateOpen(true);
  }, [startCreating, data?.canCreate]);

  const list = data ? data[tab] : [];

  return (
    <>
      {!embedded ? (
        <ScreenHeader
          title={t("meetings.title")}
          art="/brand/header-group.webp"
          back={<Link href="/menu" className="icon-btn h-9 w-9" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>}
          right={data?.canCreate ? <button type="button" className="icon-btn" aria-label={t("meetings.new")} onClick={() => setCreateOpen(true)}><Plus size={18} /></button> : undefined}
        />
      ) : null}
      <div className={embedded ? "flex flex-col gap-2 px-2" : "screen flex flex-col gap-2"} style={{ paddingTop: embedded ? 4 : 10 }}>
        {data && !data.configured ? (
          <div className="g-card-flat p-2.5">
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--warning)" }}>{t("meetings.notConfigured")}</p>
            <p className="muted tiny mt-0.5">{t("meetings.notConfiguredBody")}</p>
          </div>
        ) : null}
        <div className="flex gap-1.5">
          {(["live", "upcoming", "past"] as const).map((value) => (
            <button key={value} type="button" className={`pill flex-1 text-[11.5px] ${tab === value ? "pill-active" : ""}`} onClick={() => setTab(value)}>
              {value === "live" ? t("meetings.liveNow") : value === "upcoming" ? t("meetings.upcoming") : t("meetings.past")}
            </button>
          ))}
        </div>
        {error ? <ErrorState message={t("common.networkError")} retryLabel={t("common.retry")} onRetry={() => void load()} /> : null}
        {!data && !error ? <ListSkeleton rows={3} /> : null}
        {data && list.length === 0 ? (
          <EmptyState
            icon={<Video size={22} />}
            title={t("meetings.emptyTitle")}
            body={t("meetings.emptyBody")}
            action={data.canCreate ? <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> {t("meetings.new")}</button> : undefined}
          />
        ) : null}
        {list.map((meeting) => (
          <div key={meeting.id} className="g-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
                  {meeting.title}
                  {meeting.status === "LIVE" ? <span className="rounded-full px-1.5 py-0.5 text-[8.5px] font-bold" style={{ background: "#ff2f61", color: "#fff" }}>LIVE</span> : null}
                  {meeting.locked ? <span className="muted text-[9px]">🔒</span> : null}
                </p>
                <p className="muted tiny mt-0.5">{t("meetings.host")}: {meeting.hostName} · {formatDateTime(meeting.startsAt, locale)}</p>
                <p className="muted tiny">{t("meetings.participants")}: {meeting.participantCount}</p>
              </div>
              <div className="flex flex-none items-center gap-1">
                {meeting.canHost ? (
                  <button type="button" className="flex h-9 w-8 items-center justify-center" aria-label={t("meetings.room")} onClick={() => setHostMenu(meeting)}>
                    <MoreVertical size={16} />
                  </button>
                ) : null}
                {meeting.status !== "ENDED" && meeting.status !== "CANCELLED" ? (
                  <Link href={`/meetings/${meeting.id}`} className="btn btn-primary min-h-[34px] px-3 text-[11.5px]">{t("meetings.join")}</Link>
                ) : (
                  <span className="pill min-h-[30px] px-2 text-[10px]">{t("meetings.ended")}</span>
                )}
              </div>
            </div>
            {meeting.description ? <p className="muted mt-1 line-clamp-2 text-[11.5px]">{meeting.description}</p> : null}
          </div>
        ))}
      </div>

      <MeetingFormSheet open={createOpen} onClose={() => setCreateOpen(false)} groupId={groupId} onCreated={(id) => { setCreateOpen(false); toast(t("meetings.created"), "success"); void load(); router.push(`/meetings/${id}`); }} />

      <Sheet open={Boolean(hostMenu)} onClose={() => setHostMenu(null)} title={hostMenu?.title ?? ""}>
        {hostMenu ? (
          <div className="flex flex-col gap-2">
            <button type="button" className="btn btn-ghost justify-start" onClick={async () => { await api("/api/meetings", { method: "POST", body: { action: "mute-all", meetingId: hostMenu.id } }); setHostMenu(null); toast(t("meetings.muteAll"), "success"); }}>
              <MicOff size={15} /> {t("meetings.muteAll")}
            </button>
            <button type="button" className="btn btn-ghost justify-start" onClick={async () => { await api("/api/meetings", { method: "POST", body: { action: "lock", meetingId: hostMenu.id, locked: !hostMenu.locked } }); setHostMenu(null); void load(); }}>
              {hostMenu.locked ? t("meetings.unlock") : t("meetings.lock")}
            </button>
            <button type="button" className="btn btn-ghost justify-start" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/meetings/join/${hostMenu.id}`); toast(t("meetings.copied"), "success"); }}>
              <Link2 size={15} /> {t("meetings.inviteLink")}
            </button>
            <button type="button" className="btn btn-danger justify-start" onClick={async () => { await api("/api/meetings", { method: "POST", body: { action: "end", meetingId: hostMenu.id } }); setHostMenu(null); void load(); }}>
              <PhoneOff size={15} /> {t("meetings.endForAll")}
            </button>
            <button type="button" className="btn btn-danger justify-start" onClick={() => { setDeleteTarget(hostMenu); setHostMenu(null); }}>
              {t("delete.menu")}
            </button>
          </div>
        ) : null}
      </Sheet>

      <PermanentDeleteDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        type="meeting"
        targetId={deleteTarget?.id ?? ""}
        label={deleteTarget?.title ?? ""}
        onDeleted={() => void load()}
      />
    </>
  );
}

export function MeetingFormSheet({ open, onClose, onCreated, groupId = null }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; groupId?: string | null }) {
  const { t, toast } = useApp();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState("60");
  const [group, setGroup] = useState(groupId ?? "");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api<{ items: { id: string; name: string; isMember: boolean }[] }>("/api/groups?scope=mine").then((result) => {
      if (result.ok) setGroups(result.data.items);
    });
  }, [open]);

  const submit = async () => {
    if (title.trim().length < 3) {
      toast(t("meetings.titleField"), "error");
      return;
    }
    setBusy(true);
    const result = await api<{ id: string }>("/api/meetings", {
      method: "POST",
      body: { action: "create", title, description, startNow, startsAt: startNow ? "" : startsAt ? new Date(startsAt).toISOString() : "", durationMinutes: Number(duration), groupId: group },
    });
    setBusy(false);
    if (!result.ok) {
      toast(t("common.error"), "error");
      return;
    }
    onCreated(result.data.id);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("meetings.new")}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="meeting-title">{t("meetings.titleField")}</label>
          <input id="meeting-title" className="field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} />
        </div>
        <div>
          <label className="label" htmlFor="meeting-desc">{t("meetings.description")}</label>
          <textarea id="meeting-desc" className="field" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={`pill flex-1 text-[12px] ${startNow ? "pill-active" : ""}`} onClick={() => setStartNow(true)}>{t("meetings.startNow")}</button>
          <button type="button" className={`pill flex-1 text-[12px] ${!startNow ? "pill-active" : ""}`} onClick={() => setStartNow(false)}>{t("meetings.schedule")}</button>
        </div>
        {!startNow ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px]">
              {t("meetings.startsAt")}
              <input type="datetime-local" className="field" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-[11px]">
              {t("meetings.duration")}
              <input type="number" min={10} max={480} className="field" value={duration} onChange={(event) => setDuration(event.target.value)} />
            </label>
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="meeting-group">{t("meetings.group")}</label>
          <select id="meeting-group" className="field" value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="">{t("meetings.noGroup")}</option>
            {groups.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </div>
        <p className="muted tiny">{t("meetings.audioOnly")}</p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>{busy ? <Spinner /> : <Video size={15} />} {startNow ? t("meetings.startNow") : t("meetings.schedule")}</button>
      </div>
    </Sheet>
  );
}

export function MeetingLobbyScreen({ meetingId }: { meetingId: string }) {
  const { t, toast, locale } = useApp();
  const router = useRouter();
  const [data, setData] = useState<{ meeting: { id: string; title: string; description: string; startsAt: string; live: boolean; locked: boolean; host: { name: string }; participants: { id: string; displayName: string; avatarUrl: string | null }[]; canHost: boolean }; configured: boolean } | null>(null);
  const [error, setError] = useState(false);
  const [level, setLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const load = useCallback(async () => {
    const result = await api<NonNullable<typeof data>>(`/api/meetings?id=${meetingId}`);
    if (result.ok) {
      setData(result.data);
      setError(false);
    } else setError(true);
  }, [meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(buffer);
          const avg = buffer.reduce((total, value) => total + value, 0) / buffer.length;
          setLevel(Math.min(avg / 90, 1));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((device) => device.kind === "audioinput"));
        setOutputs(list.filter((device) => device.kind === "audiooutput"));
      } catch {
        setMicError(t("meetings.permission"));
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [t]);

  const join = async () => {
    setJoining(true);
    const result = await api<{ ok: boolean; configured?: boolean; error?: string }>("/api/meetings", { method: "POST", body: { action: "join", meetingId } });
    setJoining(false);
    if (!result.ok) {
      toast(result.data.error === "meeting_locked" ? t("meetings.locked") : result.data.error === "not_invited" ? t("meetings.notInvited") : t("meetings.joinFailed"), "error");
      return;
    }
    router.push(`/meetings/${meetingId}/room`);
  };

  if (error) return <div className="screen pt-6"><ErrorState message={t("meetings.notInvited")} retryLabel={t("common.retry")} onRetry={() => void load()} /></div>;
  if (!data) return <div className="screen flex justify-center pt-10"><Spinner size={22} /></div>;

  return (
    <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
      <div className="flex items-center gap-2">
        <Link href="/meetings" className="icon-btn h-9 w-9" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>
        <p className="text-[15px] font-semibold">{data.meeting.title}</p>
      </div>
      <div className="g-card p-3.5">
        <p className="muted text-[12px]">{t("meetings.lobby")}</p>
        <p className="mt-1 text-[12px]">{t("meetings.host")}: {data.meeting.host.name} · {formatDateTime(data.meeting.startsAt, locale)}</p>
        {data.meeting.description ? <p className="muted mt-1 text-[12px]">{data.meeting.description}</p> : null}
        <div className="mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold"><Mic size={13} /> {t("meetings.micTest")}</p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--card)]">
            <div className="h-full rounded-full" style={{ width: `${Math.round(level * 100)}%`, background: "linear-gradient(90deg,#22C55E,#4FC3FF)" }} />
          </div>
          <p className="muted tiny mt-1">{micError ?? t("meetings.micLevel")}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-1 text-[10px]">
              {t("meetings.chooseMic")}
              <select
                className="field min-h-[34px] text-[11px]"
                onChange={async (event) => {
                  streamRef.current?.getTracks().forEach((track) => track.stop());
                  try {
                    streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: event.target.value }, echoCancellation: true, noiseSuppression: true } });
                  } catch {
                    setMicError(t("meetings.permission"));
                  }
                }}
              >
                {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("meetings.chooseMic")}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px]">
              {t("meetings.chooseOutput")}
              <select className="field min-h-[34px] text-[11px]">
                {outputs.length ? outputs.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("meetings.chooseOutput")}</option>) : <option>{t("meetings.chooseOutput")}</option>}
              </select>
            </label>
          </div>
        </div>
        {data.meeting.locked && !data.meeting.canHost ? <p className="mt-2 text-[12px]" style={{ color: "var(--warning)" }}>{t("meetings.locked")}</p> : null}
        <button type="button" className="btn btn-primary mt-3 w-full" disabled={joining} onClick={() => void join()}>
          {joining ? <Spinner /> : <Video size={15} />} {t("meetings.join")}
        </button>
        {!data.configured ? <p className="muted tiny mt-2">{t("meetings.notConfiguredBody")}</p> : null}
      </div>
      <div className="g-card p-3">
        <p className="mb-1.5 text-[12.5px] font-semibold">{t("meetings.participants")} ({data.meeting.participants.length})</p>
        {data.meeting.participants.map((participant) => (
          <div key={participant.id} className="flex items-center gap-2 border-b border-[var(--border)] py-1.5 last:border-b-0">
            <Avatar name={participant.displayName} src={participant.avatarUrl} size={24} />
            <span className="flex-1 truncate text-[12px]">{participant.displayName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MeetingRoomScreen({ meetingId }: { meetingId: string }) {
  const { t, toast } = useApp();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ready" | "unconfigured" | "error" | "ended">("loading");
  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [hand, setHand] = useState(false);
  const [participants, setParticipants] = useState<{ id: string; name: string; speaking: boolean }[]>([]);
  const [messages, setMessages] = useState<{ id: string; name: string; text: string }[]>([]);
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [network, setNetwork] = useState<string>("good");
  const [reconnecting, setReconnecting] = useState(false);
  const [canHost, setCanHost] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomRef = useRef<any>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const tokenResult = await api<{ configured: boolean; token?: string; url?: string; canHost?: boolean; error?: string }>(`/api/meetings/${meetingId}/token`, { method: "POST" });
      if (!tokenResult.ok || !tokenResult.data.configured) {
        if (!disposed) setStatus(tokenResult.data.error === "meeting_ended" ? "ended" : "unconfigured");
        return;
      }
      try {
        const { Room, RoomEvent } = await import("livekit-client");
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        setCanHost(Boolean(tokenResult.data.canHost));
        room.on(RoomEvent.ParticipantConnected, () => sync(room, RoomEvent));
        room.on(RoomEvent.ParticipantDisconnected, () => sync(room, RoomEvent));
        room.on(RoomEvent.ActiveSpeakersChanged, () => sync(room, RoomEvent));
        room.on(RoomEvent.ConnectionQualityChanged, () => sync(room, RoomEvent));
        room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const decoded = JSON.parse(new TextDecoder().decode(payload)) as { type: string; name?: string; text?: string };
            if (decoded.type === "chat" && decoded.text) setMessages((prev) => [...prev.slice(-40), { id: crypto.randomUUID(), name: decoded.name ?? "", text: decoded.text as string }]);
            if (decoded.type === "hand" && decoded.name) setMessages((prev) => [...prev.slice(-40), { id: crypto.randomUUID(), name: decoded.name ?? "", text: t("meetings.handRaised") }]);
          } catch {
            undefined;
          }
        });
        room.on(RoomEvent.Disconnected, () => setStatus("ended"));
        room.on(RoomEvent.Reconnecting, () => setReconnecting(true));
        room.on(RoomEvent.Reconnected, () => setReconnecting(false));
        await room.connect(tokenResult.data.url as string, tokenResult.data.token as string);
        await room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
        sync(room, RoomEvent);
        if (!disposed) setStatus("ready");
      } catch {
        if (!disposed) setStatus("error");
      }
    })();

    function sync(room: { remoteParticipants: Map<string, { identity: string; name?: string; isSpeaking: boolean }>; localParticipant: { identity: string; name?: string; isSpeaking: boolean } }, _event: unknown) {
      const list = Array.from(room.remoteParticipants.values()).map((participant) => ({ id: participant.identity, name: participant.name || participant.identity.slice(0, 6), speaking: participant.isSpeaking }));
      list.unshift({ id: room.localParticipant.identity, name: `${room.localParticipant.name || "You"} (${t("meetings.you")})`, speaking: room.localParticipant.isSpeaking });
      setParticipants(list);
    }

    return () => {
      disposed = true;
      const room = roomRef.current;
      if (room) {
        void room.disconnect();
        void api("/api/meetings", { method: "POST", body: { action: "leave", meetingId } });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  const toggleShare = async () => {
    const room = roomRef.current;
    if (!room) return;
    if (!sharing) {
      const claim = await api<{ ok?: boolean; error?: string }>("/api/meetings", { method: "POST", body: { action: "claim-screen", meetingId } });
      if (!claim.ok) {
        toast(t("meetings.screenLimit"), "error");
        return;
      }
      try {
        await room.localParticipant.setScreenShareEnabled(true);
        setSharing(true);
      } catch {
        await api("/api/meetings", { method: "POST", body: { action: "release-screen", meetingId } });
        toast(t("common.error"), "error");
      }
    } else {
      await room.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
      await api("/api/meetings", { method: "POST", body: { action: "release-screen", meetingId } });
      setSharing(false);
    }
  };

  const send = async () => {
    const room = roomRef.current;
    if (!room || !text.trim()) return;
    const payload = new TextEncoder().encode(JSON.stringify({ type: "chat", name: room.localParticipant.name ?? t("meetings.you"), text: text.trim() }));
    await room.localParticipant.publishData(payload, { reliable: true });
    setMessages((prev) => [...prev.slice(-40), { id: crypto.randomUUID(), name: `${room.localParticipant.name ?? ""} (${t("meetings.you")})`, text: text.trim() }]);
    setText("");
  };

  if (status === "loading") return <div className="screen flex justify-center pt-10"><Spinner size={22} /></div>;

  if (status === "unconfigured" || status === "error" || status === "ended") {
    return (
      <div className="screen flex flex-col gap-2.5" style={{ paddingTop: 12 }}>
        <div className="flex items-center gap-2">
          <Link href="/meetings" className="icon-btn h-9 w-9" aria-label={t("common.back")}><ArrowLeft size={16} /></Link>
          <p className="text-[15px] font-semibold">{t("meetings.room")}</p>
        </div>
        <div className="g-card flex flex-col items-center gap-2 p-5 text-center">
          <PhoneOff size={24} style={{ color: "var(--warning)" }} />
          <p className="text-[14px] font-semibold">
            {status === "ended" ? t("meetings.ended") : status === "error" ? t("meetings.joinFailed") : t("meetings.notConfigured")}
          </p>
          <p className="muted text-[12px]">{status === "ended" ? t("meetings.emptyBody") : t("meetings.notConfiguredBody")}</p>
          <Link href="/meetings" className="btn btn-primary mt-1">{t("meetings.title")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#05080f] text-white">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top))]">
        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10" aria-label={t("meetings.leave")} onClick={() => router.push("/meetings")}><ArrowLeft size={17} /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{t("meetings.room")}</p>
          <p className="truncate text-[10px] text-white/65">{reconnecting ? t("meetings.connection") : network === "good" ? t("meetings.networkGood") : network}</p>
        </div>
        {canHost ? <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10" aria-label={t("meetings.lock")} onClick={() => setMenuOpen(true)}><MoreVertical size={17} /></button> : null}
      </div>

      <div ref={stageRef} className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-4">
        <div className="grid w-full max-w-[360px] grid-cols-3 gap-2">
          {participants.map((participant) => (
            <div key={participant.id} className="flex flex-col items-center gap-1 rounded-[12px] border border-white/12 bg-white/5 p-2" style={participant.speaking ? { boxShadow: "0 0 0 2px #4FC3FF", animation: "pulse-dot 1.6s infinite" } : undefined}>
              <Avatar name={participant.name} size={34} />
              <span className="max-w-full truncate text-[9.5px]">{participant.name}</span>
            </div>
          ))}
        </div>
        {sharing ? <p className="rounded-full bg-white/10 px-3 py-1 text-[11px]"><Monitor size={12} className="mr-1 inline" />{t("meetings.shareScreen")}</p> : null}
        <div className="w-full max-w-[360px] rounded-[12px] border border-white/12 bg-white/5 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-white/55">{t("meetings.inCallChat")}</p>
          <div className="hide-scroll max-h-28 overflow-y-auto">
            {messages.length === 0 ? <p className="text-[10px] text-white/45">{t("meetings.inCallChat")}</p> : null}
            {messages.map((message) => (
              <p key={message.id} className="text-[11px]"><b>{message.name}:</b> {message.text}</p>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void send(); }} placeholder={t("meetings.sendMessage")} className="min-h-[30px] flex-1 rounded-[8px] bg-white/10 px-2 text-[11px] text-white outline-none" />
            <button type="button" className="rounded-[8px] bg-white/15 px-2 text-[11px]" onClick={() => void send()}>{t("common.send")}</button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
        <button type="button" onClick={() => void toggleMic()} className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: muted ? "#EF4444" : "rgba(255,255,255,0.14)" }} aria-label={muted ? t("meetings.unmute") : t("meetings.mute")}>
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button
          type="button"
          onClick={async () => {
            const next = !hand;
            setHand(next);
            const room = roomRef.current;
            if (room && next) await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: "hand", name: room.localParticipant.name })), { reliable: true });
          }}
          className="flex h-11 items-center justify-center rounded-full px-3 text-[11px]"
          style={{ background: hand ? "#318BFF" : "rgba(255,255,255,0.14)" }}
        >
          ✋ {hand ? t("meetings.lowerHand") : t("meetings.raiseHand")}
        </button>
        <button type="button" onClick={() => void toggleShare()} className="flex h-11 items-center justify-center rounded-full px-3 text-[11px]" style={{ background: sharing ? "#8B4DFF" : "rgba(255,255,255,0.14)" }}>
          <Monitor size={16} className="mr-1" /> {sharing ? t("meetings.stopShare") : t("meetings.shareScreen")}
        </button>
        <button
          type="button"
          className="flex h-11 items-center justify-center rounded-full px-3 text-[11px]"
          style={{ background: "rgba(255,255,255,0.14)" }}
          onClick={() => {
            if (!document.fullscreenElement) void stageRef.current?.requestFullscreen().catch(() => undefined);
            else void document.exitFullscreen();
          }}
        >
          {t("meetings.fullscreen")}
        </button>
        <button type="button" onClick={() => router.push("/meetings")} className="flex h-11 items-center justify-center rounded-full bg-[#EF4444] px-3 text-[11px]">
          <PhoneOff size={15} className="mr-1" /> {t("meetings.leave")}
        </button>
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t("meetings.room")}>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn btn-ghost justify-start" onClick={async () => { await api("/api/meetings", { method: "POST", body: { action: "mute-all", meetingId } }); toast(t("meetings.muteAll"), "success"); }}>
            <MicOff size={15} /> {t("meetings.muteAll")}
          </button>
          <button type="button" className="btn btn-ghost justify-start" onClick={async () => { await api("/api/meetings", { method: "POST", body: { action: "lock", meetingId, locked: true } }); toast(t("meetings.lock"), "success"); setMenuOpen(false); }}>
            {t("meetings.lock")}
          </button>
          <button type="button" className="btn btn-ghost justify-start" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/meetings/join/${meetingId}`); toast(t("meetings.copied"), "success"); }}>
            <Link2 size={15} /> {t("meetings.inviteLink")}
          </button>
          <button type="button" className="btn btn-danger justify-start" onClick={async () => { await api("/api/meetings", { method: "POST", body: { action: "end", meetingId } }); router.push("/meetings"); }}>
            <PhoneOff size={15} /> {t("meetings.endForAll")}
          </button>
          <p className="muted tiny">{t("meetings.participants")}: {participants.length}</p>
          {participants.map((participant) => (
            <div key={participant.id} className="flex items-center gap-2 text-[12px]">
              {participant.name}
              <button type="button" className="ml-auto text-[10px] underline" onClick={async () => { await api("/api/meetings", { method: "POST", body: { action: "remove", meetingId, userId: participant.id } }); setMenuOpen(false); toast(t("meetings.remove"), "success"); }}>
                <UserX size={12} className="mr-0.5 inline" />{t("meetings.remove")}
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

export function MeetingJoinScreen({ token }: { token: string }) {
  const { t, toast } = useApp();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [meetingId, setMeetingId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await api<{ meeting?: { id: string } }>(`/api/meetings?invite=${encodeURIComponent(token)}`);
      if (result.ok && result.data.meeting) {
        setMeetingId(result.data.meeting.id);
        setState("ready");
      } else if (result.status === 401) {
        router.push("/login");
      } else {
        setState("invalid");
      }
    })();
  }, [token, router]);

  return (
    <div className="screen flex flex-col gap-2.5 pt-6">
      <div className="g-card flex flex-col items-center gap-2 p-5 text-center">
        <Users size={24} className="text-[var(--electric)]" />
        <p className="text-[15px] font-semibold">{t("meetings.join")}</p>
        {state === "invalid" ? <p className="muted text-[12px]">{t("meetings.notInvited")}</p> : null}
        {state === "ready" && meetingId ? (
          <button
            type="button"
            className="btn btn-primary mt-1"
            onClick={async () => {
              const result = await api("/api/meetings", { method: "POST", body: { action: "join", meetingId } });
              if (!result.ok) {
                toast(result.data.error === "meeting_locked" ? t("meetings.locked") : t("meetings.joinFailed"), "error");
                return;
              }
              router.push(`/meetings/${meetingId}`);
            }}
          >
            {t("meetings.join")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const _unusedMeetingsUi = { Search, NameWithTag };
