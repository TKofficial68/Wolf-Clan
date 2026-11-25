import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import { Tutorial } from "@/components/tutorial";
import { getSessionUser } from "@/lib/auth";

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect(user.bannedAt ? "/blocked" : "/home");
  const store = await cookies();
  if (store.get("wolf_tutorial")?.value === "1") redirect("/login");
  const theme = store.get("wolf_theme")?.value;
  const language = store.get("wolf_lang")?.value === "bn" ? "bn" : "en";
  return (
    <Providers
      authenticated={false}
      onboardingCompleted={false}
      initialPrefs={{
        theme: theme === "light" || theme === "system" ? theme : "dark",
        language,
        reduceMotion: store.get("wolf_motion")?.value === "1",
        animationLevel: store.get("wolf_anim")?.value === "lite" ? "lite" : "full",
      }}
    >
      <Tutorial />
    </Providers>
  );
}
