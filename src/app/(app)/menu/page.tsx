import { requireUser } from "@/lib/auth";
import { MenuScreen } from "@/components/menu-screen";

export default async function MenuPage() {
  const user = await requireUser();
  return <MenuScreen role={user.role} />;
}
