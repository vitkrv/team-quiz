import { createContext } from 'react';
import { DEFAULT_LANGUAGE, translate } from './i18n';

export const LanguageContext = createContext({
    language: DEFAULT_LANGUAGE,
    setLanguage: () => {},
    t: (key, params) => translate(DEFAULT_LANGUAGE, key, params)
});
