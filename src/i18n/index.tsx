'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

import en from './translations/en.json';
import no from './translations/no.json';
import cs from './translations/cs.json';
import pl from './translations/pl.json';
import de from './translations/de.json';

export type Locale = 'en' | 'no' | 'cs' | 'pl' | 'de';

const translations: Record<Locale, Record<string, string>> = { en, no, cs, pl, de };

export const localeLabels: Record<Locale, string> = {
  en: '🇬🇧 EN',
  no: '🇳🇴 NO',
  cs: '🇨🇿 CS',
  pl: '🇵🇱 PL',
  de: '🇩🇪 DE',
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');

  const t = useCallback(
    (key: string): string => {
      return translations[locale]?.[key] || translations.en[key] || key;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
