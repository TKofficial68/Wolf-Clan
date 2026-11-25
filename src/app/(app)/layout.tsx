import type { ReactNode } from "react";
import { validateServerEnv } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { getUserSettings } from "@/lib/settings";
import { getCapabilities } from "@/lib/perms";
import { Providers, type AnimationLevel, type Theme } from "@/components/providers";
import { BottomNav } from "@/components/bottom-nav";
import { ViewerProvider } from "@/components/media-viewer-provider";
import type { Locale } from "@/i18n";

export default async function AppLayout({ children }: { children: ReactNode }) {
  validateServerEnv();
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  const capabilities = await getCapabilities(user);
  const theme: Theme = settings.theme === "light" || settings.theme === "system" ? settings.theme : "dark";
  const language: Locale = settings.language === "bn" ? "bn" : "en";
  const animationLevel: AnimationLevel = settings.animationLevel === "lite" ? "lite" : "full";

  return (
    <Providers
      authenticated
      onboardingCompleted={user.onboardingCompleted}
      capabilities={capabilities}
      role={user.role}
      initialPrefs={{
        theme,
        language,
        reduceMotion: settings.reduceMotion,
        animationLevel,
      }}
    >
      <ViewerProvider>
        <div className="app-frame chrome">
          <div className="app-body">
            {children}
            <BottomNav />
          </div>
        </div>
      </ViewerProvider>
    </Providers>
  );
}
