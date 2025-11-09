import { getLocales } from "expo-localization";
import { en } from "./locales/en";
import { es } from "./locales/es";

const translations = {
  en,
  es,
};

type LocaleCode = keyof typeof translations;
type TranslationDictionary = (typeof translations)[LocaleCode];

const FALLBACK_LOCALE: LocaleCode = "en";

export type TranslationKey = keyof typeof en;
export type TranslationReplacements = Record<string, string | number>;

function resolveLocale(): string {
  const locales = getLocales();

  for (const locale of locales) {
    const candidates: string[] = [];

    if (locale.languageTag) {
      candidates.push(locale.languageTag.toLowerCase());
    }

    if (locale.languageCode) {
      if (locale.regionCode) {
        candidates.push(`${locale.languageCode.toLowerCase()}-${locale.regionCode.toUpperCase()}`);
      }
      candidates.push(locale.languageCode.toLowerCase());
    }

    for (const candidate of candidates) {
      const match = findMatchingLocale(candidate);
      if (match) {
        return match;
      }
    }
  }

  return FALLBACK_LOCALE;
}

function findMatchingLocale(candidate: string): string | null {
  if (candidate in translations) {
    return candidate;
  }

  const lower = candidate.toLowerCase();
  if (lower in translations) {
    return lower;
  }

  const short = lower.split("-")[0];
  if (short in translations) {
    return short;
  }

  return null;
}

function getDictionary(locale: string): TranslationDictionary {
  const match = findMatchingLocale(locale);
  if (match && match in translations) {
    return translations[match as LocaleCode];
  }
  return translations[FALLBACK_LOCALE];
}

function applyReplacements(template: string, replacements?: TranslationReplacements): string {
  if (!replacements) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, token) => {
    const replacement = replacements[token];
    return replacement === undefined ? match : String(replacement);
  });
}

export function translate(key: TranslationKey, replacements?: TranslationReplacements): string {
  const locale = resolveLocale();
  const dictionary = getDictionary(locale);
  const fallbackDictionary = translations[FALLBACK_LOCALE];
  const template = (dictionary[key] ?? fallbackDictionary[key] ?? key) as string;

  return applyReplacements(template, replacements);
}
