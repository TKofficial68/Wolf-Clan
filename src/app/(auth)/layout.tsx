import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Providers, type AnimationLevel, type Theme } from "@/components/providers";
import type { Locale } from "@/i18n";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const rawTheme = store.get("wolf_theme")?.value;
  const theme: Theme = rawTheme === "light" || rawTheme === "system" ? rawTheme : "dark";
  const language: Locale = store.get("wolf_lang")?.value === "bn" ? "bn" : "en";
  const animationLevel: AnimationLevel = store.get("wolf_anim")?.value === "lite" ? "lite" : "full";
  const reduceMotion = store.get("wolf_motion")?.value === "1";

  return (
    <Providers
      authenticated={false}
      onboardingCompleted={false}
      initialPrefs={{ theme, language, reduceMotion, animationLevel }}
    >
      {children}
    </Providers>
  );
}
