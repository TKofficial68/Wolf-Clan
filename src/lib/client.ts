export type ApiError = { error?: string; reason?: string };

export async function api<T = Record<string, unknown>>(
  url: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<{ ok: boolean; status: number; data: T & ApiError }> {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
    credentials: "same-origin",
  });
  let data: unknown = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { ok: response.ok, status: response.status, data: data as T & ApiError };
}

export function errorKey(code: string | undefined, fallback = "common.error"): string {
  switch (code) {
    case "rate_limited":
      return "auth.rateLimited";
    case "invalid_credentials":
      return "auth.invalidCredentials";
    case "email_in_use":
      return "auth.emailInUse";
    case "username_taken":
      return "auth.usernameTaken";
    case "password_short":
      return "auth.passwordShort";
    case "password_mismatch":
      return "auth.passwordMismatch";
    case "invalid_email":
      return "auth.invalidEmail";
    case "invalid_username":
      return "auth.usernameInvalid";
    case "invalid_name":
      return "auth.nameInvalid";
    case "invite_required":
      return "auth.inviteRequired";
    case "invite_invalid":
      return "auth.inviteInvalid";
    case "pending_approval":
      return "auth.pendingApprovalLogin";
    case "wrong_password":
      return "settings.wrongPassword";
    case "email_not_configured":
      return "auth.emailNotConfigured";
    case "reset_invalid":
      return "auth.resetInvalid";
    case "too_short":
      return "contact.tooShort";
    case "too_long":
      return "contact.tooLong";
    case "subject_required":
      return "contact.subjectRequired";
    case "blocked_by_target":
    case "blocked_by_me":
      return "profile.blockedNotice";
    default:
      return fallback;
  }
}
