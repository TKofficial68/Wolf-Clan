"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { useApp } from "./providers";
import { WolfMark } from "./wolf-art";

function SlideArt({ index }: { index: number }) {
  const common = { stroke: "url(#tutGrad)", strokeWidth: 2.2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 120 120" className="h-[112px] w-[112px]" aria-hidden="true">
      <defs>
        <linearGradient id="tutGrad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#4FC3FF" />
          <stop offset="0.6" stopColor="#8B4DFF" />
          <stop offset="1" stopColor="#FF5BD6" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r="52" stroke="rgba(139,77,255,0.35)" strokeWidth="1.2" fill="none" />
      {index === 0 ? (
        <g>
          <circle cx="60" cy="44" r="14" {...common} />
          <path d="M34 96c0-14 12-24 26-24s26 10 26 24" {...common} />
          <path d="M20 34h16M20 46h10" {...common} />
        </g>
      ) : index === 1 ? (
        <g>
          <rect x="24" y="30" width="72" height="60" rx="10" {...common} />
          <circle cx="46" cy="56" r="7" {...common} />
          <circle cx="74" cy="56" r="7" {...common} />
          <path d="M38 76c6-8 16-8 22 0M64 76c6-8 14-8 20 0" {...common} />
        </g>
      ) : index === 2 ? (
        <g>
          <rect x="22" y="34" width="76" height="52" rx="10" {...common} />
          <path d="M52 48l18 12-18 12V48z" {...common} />
          <path d="M34 96h52" {...common} />
        </g>
      ) : index === 3 ? (
        <g>
          <rect x="30" y="24" width="60" height="76" rx="9" {...common} />
          <path d="M44 44h32M44 58h32M44 72h18" {...common} />
          <path d="M74 84l6 6 10-12" {...common} />
        </g>
      ) : (
        <g>
          <circle cx="60" cy="52" r="20" {...common} />
          <circle cx="60" cy="52" r="8" {...common} />
          <path d="M60 18v10M60 76v10M26 52h10M84 52h10" {...common} />
          <path d="M38 92c6-8 14-12 22-12s16 4 22 12" {...common} />
        </g>
      )}
    </svg>
  );
}

const slides = [
  { title: "tutorial.s1title", body: "tutorial.s1body" },
  { title: "tutorial.s2title", body: "tutorial.s2body" },
  { title: "tutorial.s3title", body: "tutorial.s3body" },
  { title: "tutorial.s4title", body: "tutorial.s4body" },
  { title: "tutorial.s5title", body: "tutorial.s5body" },
] as const;

export function Tutorial() {
  const { t, locale, setLanguage } = useApp();
  const router = useRouter();
  const [index, setIndex] = useState(0);

  const complete = () => {
    try {
      localStorage.setItem("wolf_tutorial_done", "1");
    } catch {
      undefined;
    }
    document.cookie = "wolf_tutorial=1; path=/; max-age=31536000; SameSite=Lax";
    router.push("/register");
  };

  const skip = () => {
    try {
      localStorage.setItem("wolf_tutorial_done", "1");
    } catch {
      undefined;
    }
    document.cookie = "wolf_tutorial=1; path=/; max-age=31536000; SameSite=Lax";
    router.push("/login");
  };

  const slide = slides[index];
  const last = index === slides.length - 1;

  return (
    <div className="app-frame chrome">
      <div className="app-body">
        <div className="flex items-center justify-between px-3 pt-[max(12px,env(safe-area-inset-top))]">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold">
            <WolfMark size={20} /> Wolf Clan
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" className="pill min-h-[32px] px-2.5 text-[11px]" onClick={() => setLanguage(locale === "en" ? "bn" : "en")}>
              {locale === "en" ? "বাংলা" : "English"}
            </button>
            <button type="button" className="muted min-h-[32px] px-1 text-[12px]" onClick={skip}>
              {t("tutorial.skip")}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between px-5 pb-8 pt-6">
          <div key={index} className="anim-page flex flex-col items-center gap-3 text-center">
            <div className="g-card flex w-full flex-col items-center gap-3 px-4 py-7">
              <SlideArt index={index} />
              <h1 className="text-[20px] font-semibold leading-tight">{t(slide.title)}</h1>
              <p className="muted max-w-[300px] text-[13.5px] leading-relaxed">{t(slide.body)}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
              {slides.map((_, dot) => (
                <span
                  key={dot}
                  className="h-1.5 rounded-full transition-transform"
                  style={{
                    width: dot === index ? 22 : 7,
                    background: dot === index ? "linear-gradient(90deg,#4FC3FF,#D946EF)" : "var(--border)",
                  }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost flex-1" onClick={skip}>
                {t("common.skip")}
              </button>
              <button
                type="button"
                className="btn btn-primary flex-[1.4]"
                onClick={() => {
                  if (last) complete();
                  else setIndex((value) => value + 1);
                }}
              >
                {last ? <Check size={16} /> : null}
                {last ? t("tutorial.getStarted") : t("tutorial.continue")}
                {!last ? <ArrowRight size={16} /> : null}
              </button>
            </div>
            <p className="muted text-center text-[12px]">
              {t("auth.haveAccount")}{" "}
              <Link href="/login" className="font-semibold text-[var(--electric)]">
                {t("auth.login")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
