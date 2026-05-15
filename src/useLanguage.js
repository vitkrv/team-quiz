import { useContext } from 'react';
import { LanguageContext } from './languageContext';

export const useLanguage = () => useContext(LanguageContext);
