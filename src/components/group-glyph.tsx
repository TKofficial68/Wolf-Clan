"use client";

export const ACCENT_COLORS: Record<string, string> = {
  blue: "#318BFF",
  purple: "#8B4DFF",
  pink: "#D946EF",
  red: "#FF3B6B",
  green: "#22C55E",
  amber: "#F59E0B",
  teal: "#14B8A6",
  orange: "#FF8A1F",
};

export const GROUP_ICONS = ["announce", "review", "minecraft", "freefire", "meeting", "other-games", "editing", "video-ideas", "people"] as const;
export const GROUP_ACCENTS = ["blue", "purple", "pink", "red", "green", "amber", "teal", "orange"] as const;

export function GroupGlyph({ icon, size = 40 }: { icon: string; size?: number }) {
  const stroke = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (icon === "announce") {
    return (
      <svg {...stroke} aria-hidden="true">
        <path d="M10 20l22-9v26L10 28v-8z" fill="currentColor" fillOpacity="0.22" />
        <path d="M10 20l22-9v26L10 28v-8z" stroke="currentColor" />
        <path d="M14 29l4 10h5l-4-9" stroke="currentColor" />
        <path d="M34 17c4 3 4 11 0 14" stroke="currentColor" />
      </svg>
    );
  }
  if (icon === "review") {
    return (
      <svg {...stroke} aria-hidden="true">
        <circle cx="24" cy="24" r="15" stroke="currentColor" />
        <path d="M20 17l11 7-11 7V17z" fill="currentColor" fillOpacity="0.3" stroke="currentColor" />
      </svg>
    );
  }
  if (icon === "minecraft") {
    return (
      <svg {...stroke} aria-hidden="true">
        <path d="M24 7l15 8v18l-15 8-15-8V15l15-8z" stroke="currentColor" fill="currentColor" fillOpacity="0.14" />
        <path d="M9 15l15 8 15-8M24 23v18" stroke="currentColor" />
      </svg>
    );
  }
  if (icon === "freefire") {
    return (
      <svg {...stroke} aria-hidden="true">
        <path d="M27 5L14 26h9l-3 17 15-23h-9l1-15z" stroke="currentColor" fill="currentColor" fillOpacity="0.2" />
      </svg>
    );
  }
  if (icon === "meeting" || icon === "people") {
    return (
      <svg {...stroke} aria-hidden="true">
        <circle cx="18" cy="18" r="7" stroke="currentColor" />
        <circle cx="32" cy="20" r="5" stroke="currentColor" />
        <path d="M6 39c0-6 5-10 12-10s12 4 12 10H6z" stroke="currentColor" fill="currentColor" fillOpacity="0.14" />
        <path d="M28 39c0-5 3-8 7-8s7 3 7 8H28z" stroke="currentColor" />
      </svg>
    );
  }
  if (icon === "editing") {
    return (
      <svg {...stroke} aria-hidden="true">
        <path d="M12 36l3-9 18-18 6 6-18 18-9 3z" stroke="currentColor" fill="currentColor" fillOpacity="0.12" />
        <path d="M29 15l6 6M9 42h30" stroke="currentColor" />
      </svg>
    );
  }
  if (icon === "video-ideas") {
    return (
      <svg {...stroke} aria-hidden="true">
        <rect x="8" y="14" width="32" height="22" rx="5" stroke="currentColor" />
        <path d="M24 8v3M19 25l7 4-7 4v-8z" stroke="currentColor" fill="currentColor" fillOpacity="0.25" />
      </svg>
    );
  }
  return (
    <svg {...stroke} aria-hidden="true">
      <path d="M24 8a8 8 0 018 8c0 5-8 12-8 12S16 21 16 16a8 8 0 018-8z" stroke="currentColor" />
      <circle cx="24" cy="16" r="3" stroke="currentColor" />
      <path d="M10 40c2-7 7-11 14-11s12 4 14 11" stroke="currentColor" />
    </svg>
  );
}
