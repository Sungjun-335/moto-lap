import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { Locale, Translations } from './types';
import { en } from './en';
import { ko } from './ko';

const translations: Record<Locale, Translations> = { en, ko };

interface LanguageContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: Translations;
}

const LanguageContext = createContext<LanguageContextValue>({
    locale: 'en',
    setLocale: () => {},
    t: en,
});

const STORAGE_KEY = 'motolap-locale';

function detectInitialLocale(): Locale {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'ko' || stored === 'en') return stored;
    } catch { /* ignore */ }

    if (typeof navigator !== 'undefined' && navigator.language?.startsWith('ko')) {
        return 'ko';
    }
    return 'en';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

    const setLocale = useCallback((l: Locale) => {
        setLocaleState(l);
        try {
            localStorage.setItem(STORAGE_KEY, l);
        } catch { /* ignore */ }
    }, []);

    const value = useMemo(() => ({
        locale,
        setLocale,
        t: translations[locale],
    }), [locale, setLocale]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};

export function useTranslation() {
    return useContext(LanguageContext);
}

export const LanguageToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { locale, setLocale } = useTranslation();

    return (
        <div className={`flex rounded-md border border-zinc-700 overflow-hidden ${className}`}>
            <button
                onClick={() => setLocale('en')}
                className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                    locale === 'en'
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
            >
                EN
            </button>
            <button
                onClick={() => setLocale('ko')}
                className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                    locale === 'ko'
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
            >
                KO
            </button>
        </div>
    );
};
