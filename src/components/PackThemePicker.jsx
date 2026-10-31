import { Eye, Palette } from 'lucide-react';
import { getPackTheme, normalizeThemeId, themeTranslator } from '../utils/packTheme';

export default function PackThemePicker({ themeId, onChange, onPreview, disabled, t }) {
    const id = normalizeThemeId(themeId);
    const theme = getPackTheme(id);
    const themedText = themeTranslator(t, id);
    const colors = theme.palette || { background: '#0f172a', accent: '#facc15', secondary: '#60a5fa' };

    return (
        <section aria-labelledby="pack-theme-label" className="mb-6 rounded-xl border border-slate-700 bg-slate-800 p-4 sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div className="min-w-0">
                    <label id="pack-theme-label" htmlFor="pack-theme" className="flex items-center gap-2 font-bold text-white">
                        <Palette size={18} aria-hidden="true" className="text-purple-400" /> {t('packTheme')}
                    </label>
                    <select id="pack-theme" value={id} disabled={disabled} onChange={event => onChange(event.target.value)} aria-describedby="pack-theme-help" className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-400 disabled:opacity-50">
                        <option value="default">{t('themeDefault')}</option>
                        <option value="halloween">{t('themeHalloween')}</option>
                        <option value="music">{t('themeMusic')}</option>
                    </select>
                    <p id="pack-theme-help" className="mt-2 text-sm text-slate-400">{t('packThemeHelp')}</p>
                    <p className="mt-4 text-sm leading-relaxed text-slate-300">{t(({ halloween: 'themeHalloweenDescription', music: 'themeMusicDescription', default: 'themeDefaultDescription' })[id])}</p>
                    <button type="button" onClick={onPreview} disabled={disabled} className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500/40 bg-blue-600/20 px-4 py-2 text-sm font-bold text-blue-100 hover:bg-blue-600/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 disabled:cursor-not-allowed disabled:opacity-50">
                        <Eye size={18} aria-hidden="true" /> {t('showQuestionPackPreview')}
                    </button>
                    <p className="mt-2 text-xs text-slate-400">{t('themePreviewHint')}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-900/60 p-4" aria-labelledby="theme-details-title">
                    <h3 id="theme-details-title" className="font-bold text-white">{t('themeDetails')}</h3>
                    <dl className="mt-4 space-y-4 text-sm">
                        <div>
                            <dt className="mb-2 text-slate-400">{t('themeColors')}</dt>
                            <dd className="flex flex-wrap gap-x-4 gap-y-2">
                                {['background', 'accent', 'secondary'].map(key => (
                                    <span key={key} className="inline-flex items-center gap-2 text-slate-200">
                                        <span aria-hidden="true" className="h-4 w-4 rounded-full border border-white/30" style={{ backgroundColor: colors[key] }} />
                                        {t(`themeColor_${key}`)}
                                    </span>
                                ))}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-slate-400">{t('themeAvatars')}</dt>
                            <dd className="mt-2 flex flex-wrap gap-2 text-xl">{theme.avatars.map(avatar => <span key={avatar}>{avatar}</span>)}</dd>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><dt className="text-slate-400">{t('themeNormalBackground')}</dt><dd className="mt-1 flex flex-wrap gap-1 text-xl">{theme.normal.map(emoji => <span key={emoji}>{emoji}</span>)}</dd></div>
                            <div><dt className="text-slate-400">{t('themeSurpriseBackground')}</dt><dd className="mt-1 flex flex-wrap gap-1 text-xl">{theme.surprise.map(emoji => <span key={emoji}>{emoji}</span>)}</dd></div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><dt className="text-slate-400">{t('themeBuzzText')}</dt><dd className="mt-1 break-words font-bold text-white">{themedText('buzz')}</dd></div>
                            <div><dt className="text-slate-400">{t('leaderboard')}</dt><dd className="mt-1 break-words font-bold text-white">{themedText('leaderboard')}</dd></div>
                        </div>
                    </dl>
                </div>
            </div>
            <div className="mt-5 space-y-2 border-t border-slate-700 pt-4 text-sm leading-relaxed text-slate-400">
                <p>{t('themeSaveHint')}</p>
                <p>{t('themeGameplayHint')}</p>
                <p>{t('themeAvatarHint')}</p>
            </div>
        </section>
    );
}
