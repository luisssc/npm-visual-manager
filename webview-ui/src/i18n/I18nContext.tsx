import { createContext, useContext, useState, ReactNode } from 'react';
import { Translations, getTranslations } from './index';

interface I18nContextType {
  t: Translations;
  language: string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Get initial language from VS Code injected variable
const getInitialLanguage = (): string => {
  if (typeof window !== 'undefined' && (window as unknown as { initialLanguage?: string }).initialLanguage) {
    return (window as unknown as { initialLanguage: string }).initialLanguage;
  }
  return 'en';
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language] = useState<string>(getInitialLanguage());
  const [t] = useState<Translations>(() => getTranslations(language));

  return <I18nContext.Provider value={{ t, language }}>{children}</I18nContext.Provider>;
}

export function useTranslation(): Translations {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context.t;
}

// Helper function to interpolate translations with values
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = values[key];
    return value !== undefined ? String(value) : match;
  });
}

// Helper to get plural form (simplified for EN/ES)
export function plural(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
