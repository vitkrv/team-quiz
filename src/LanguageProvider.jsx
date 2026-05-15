import { useCallback, useMemo } from 'react';
import { LanguageContext } from './languageContext';
import { translate } from './i18n';

export default function LanguageProvider({ language, setLanguage, children }) {
    const t = useCallback((key, params) => translate(language, key, params), [language]);
    const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}
