import { useMemo } from 'react';
import { LanguageContext } from '../languageContext';
import { useLanguage } from '../useLanguage';
import { getPackTheme, normalizeThemeId, themeTranslator } from '../utils/packTheme';
export default function PackThemeScope({ themeId, children }) {
 const language = useLanguage();
 const id = normalizeThemeId(themeId);
 const value = useMemo(() => ({ ...language, t: themeTranslator(language.t,id) }), [language,id]);
 const theme = getPackTheme(id);
 const style = Object.fromEntries(Object.entries(theme.palette || {}).map(([key,color]) => ['--theme-' + key,color]));
 style['--theme-category-shadow'] = theme.categoryShadow;
 return <LanguageContext.Provider value={value}><div data-pack-theme={id} style={style} className="pack-theme-scope">{children}</div></LanguageContext.Provider>;
}
