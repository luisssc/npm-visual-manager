import { en, Translations } from './translations/en';
import { es } from './translations/es';
import { de } from './translations/de';
import { fr } from './translations/fr';
import { zhCn } from './translations/zh-cn';
import { ja } from './translations/ja';
import { ptBr } from './translations/pt-br';
import { ru } from './translations/ru';
import { ko } from './translations/ko';

const translations: Record<string, Translations> = {
  en,
  es,
  de,
  fr,
  'zh-cn': zhCn,
  ja,
  'pt-br': ptBr,
  ru,
  ko,
};

export function getTranslations(language: string): Translations {
  // Try exact match first (e.g., "es")
  const exactMatch = translations[language];
  if (exactMatch) {
    return exactMatch;
  }

  // Try language code only (e.g., "es-ES" -> "es")
  const langCode = language.split('-')[0]!;
  const langMatch = translations[langCode];
  if (langMatch) {
    return langMatch;
  }

  // Fallback to English
  return translations.en!;
}

export type { Translations };
