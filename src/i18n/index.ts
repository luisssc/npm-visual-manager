import { en, Translations } from './translations/en';
import { es } from './translations/es';

export const translations: Record<string, Translations> = {
  en,
  es,
};

export function getTranslations(language: string): Translations {
  // Try exact match first (e.g., "es")
  if (translations[language]) {
    return translations[language];
  }
  
  // Try language code only (e.g., "es-ES" -> "es")
  const langCode = language.split('-')[0];
  if (translations[langCode]) {
    return translations[langCode];
  }
  
  // Fallback to English
  return translations.en;
}

export type { Translations };
