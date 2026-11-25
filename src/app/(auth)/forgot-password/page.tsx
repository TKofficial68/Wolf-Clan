import { Suspense } from "react";
import { AuthScreen } from "@/components/auth-screen";

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <AuthScreen mode="forgot" />
    </Suspense>
  );
}
