import { en, type MessageKey, type Messages } from "./messages/en";
import { bn } from "./messages/bn";

export type Locale = "en" | "bn";

export const LOCALE_COOKIE = "wolf_lang";
export const messages: Record<Locale, Messages> = { en, bn };

export const localeLabels: Record<Locale, string> = { en: "English", bn: "বাংলা" };

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "bn";
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const table = messages[locale] ?? messages.en;
  let text = table[key] ?? en[key] ?? String(key);
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export type Translator = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function createTranslator(locale: Locale): Translator {
  return (key, vars) => translate(locale, key, vars);
}

export type { MessageKey };
