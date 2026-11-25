import type { SVGProps } from "react";

export function WolfMark({ size = 40, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="wolfGrad" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4FC3FF" />
          <stop offset="0.55" stopColor="#8B4DFF" />
          <stop offset="1" stopColor="#D946EF" />
        </linearGradient>
      </defs>
      <path
        d="M9 12l9 5h28l9-5-2 16 5 8-8 3-4 9-9 9-8-5-8 5-9-9-4-9-8-3 5-8-2-16z"
        stroke="url(#wolfGrad)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M20 29l7 4v7l-7-6v-5z" fill="url(#wolfGrad)" />
      <path d="M44 29l-7 4v7l7-6v-5z" fill="url(#wolfGrad)" />
      <path d="M27 43l5 4 5-4-5 9-5-9z" fill="url(#wolfGrad)" />
      <circle cx="25" cy="32" r="2" fill="#F8FAFC" />
      <circle cx="39" cy="32" r="2" fill="#F8FAFC" />
    </svg>
  );
}

export function WolfBannerArt() {
  return (
    <svg viewBox="0 0 660 180" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="bannerSky" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#0A1224" />
          <stop offset="1" stopColor="#150C2A" />
        </linearGradient>
        <radialGradient id="planet" cx="0.5" cy="0.1" r="0.9">
          <stop stopColor="#3FA9FF" />
          <stop offset="0.55" stopColor="#2148B8" />
          <stop offset="1" stopColor="#0B1030" />
        </radialGradient>
        <linearGradient id="fur" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#7FE3FF" />
          <stop offset="0.5" stopColor="#8B4DFF" />
          <stop offset="1" stopColor="#FF5BD6" />
        </linearGradient>
      </defs>
      <rect width="660" height="180" fill="url(#bannerSky)" />
      {[
        [60, 30, 1.6],
        [140, 60, 1.1],
        [215, 24, 1.4],
        [420, 38, 1.2],
        [560, 22, 1.7],
        [610, 66, 1.1],
        [330, 16, 1],
        [500, 52, 1.3],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#D8ECFF" opacity="0.75" />
      ))}
      <ellipse cx="330" cy="240" rx="340" ry="130" fill="url(#planet)" opacity="0.85" />
      <path d="M238 160c-8-26 0-52 16-70 8-9 20-16 24-30 2-8 0-14-4-20 12 4 20 10 24 22 4-14 14-22 28-26-8 10-8 20-4 30 6 14 20 22 28 38 12 24 8 46 2 58-16-8-26-22-30-38-6 18-20 30-40 36-16 5-32 3-44-4z" fill="url(#fur)" opacity="0.95" />
      <path d="M286 92l14 8 14-8-14 22-14-22z" fill="#0B1220" opacity="0.55" />
      <circle cx="288" cy="96" r="4" fill="#E9FBFF" />
      <circle cx="316" cy="96" r="4" fill="#E9FBFF" />
      <g opacity="0.9">
        <path d="M235 140c-40 4-70-10-84-30 18 22 46 28 84 18v12z" fill="#8B4DFF" opacity="0.35" />
        <path d="M430 140c40 4 70-10 84-30-18 22-46 28-84 18v12z" fill="#D946EF" opacity="0.3" />
      </g>
    </svg>
  );
}

export function WolfHeadSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 180" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sil" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#318BFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#D946EF" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <path
        d="M60 20l28 26h124l28-26-4 52 20 34-30 8-14 32-30 20-38-16-38 16-30-20-14-32-30-8 20-34-4-52z"
        fill="url(#sil)"
        opacity="0.6"
      />
      <path d="M112 82l20 12v18l-20-16V82zM188 82l-20 12v18l20-16V82z" fill="#070B12" opacity="0.6" />
    </svg>
  );
}

export function GroupArtIcon({ kind }: { kind: "announce" | "review" | "minecraft" | "freefire" | "meeting" }) {
  if (kind === "minecraft") {
    return (
      <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
        <path d="M24 6l16 8v20l-16 8-16-8V14l16-8z" fill="#3E8E41" />
        <path d="M8 14l16 8 16-8" stroke="#8CE99A" strokeWidth="1.6" fill="none" />
        <path d="M24 22v20" stroke="#2B6B2E" strokeWidth="1.4" />
        <path d="M16 18l8 4 8-4v8l-8 4-8-4v-8z" fill="#7B4B2A" opacity="0.75" />
      </svg>
    );
  }
  if (kind === "freefire") {
    return (
      <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
        <path d="M27 4L14 26h9l-3 18 15-24h-9l1-16z" fill="#FFB020" />
        <path d="M27 4L14 26h9l-3 18 15-24h-9l1-16z" fill="none" stroke="#FF6B2C" strokeWidth="1.4" />
      </svg>
    );
  }
  if (kind === "announce") {
    return (
      <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
        <path d="M10 20l22-10v26L10 28v-8z" fill="#E4F1FF" />
        <path d="M10 20H5v8h5" fill="#9CC9FF" />
        <path d="M14 29l4 10h5l-4-9" fill="#9CC9FF" />
        <path d="M34 16c5 3 5 13 0 16" stroke="#4FC3FF" strokeWidth="2.4" fill="none" />
      </svg>
    );
  }
  if (kind === "review") {
    return (
      <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
        <circle cx="24" cy="24" r="17" fill="#FF3B6B" />
        <path d="M20 16l13 8-13 8V16z" fill="#FFFFFF" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
      <circle cx="18" cy="18" r="7" fill="#9CC9FF" />
      <circle cx="32" cy="20" r="5" fill="#6EA8FF" />
      <path d="M6 38c0-6 5-10 12-10s12 4 12 10H6z" fill="#9CC9FF" />
      <path d="M28 38c0-5 3-8 7-8s7 3 7 8H28z" fill="#6EA8FF" />
    </svg>
  );
}
