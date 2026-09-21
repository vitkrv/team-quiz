import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Award, CheckCircle, XCircle, MousePointerClick, Timer, Clock, Zap, Target, Flame } from 'lucide-react';
import { saveUsername } from '../actions/profileActions';
import useProfileAchievements from '../hooks/useProfileAchievements';
import { useLanguage } from '../useLanguage';

const achievementTypes = [
    ['correct', CheckCircle], ['incorrect', XCircle], ['buzzes', MousePointerClick],
    ['early', Timer], ['late', Clock], ['closestLate', Zap], ['accuracy', Target], ['streak', Flame]
];
const panel = 'rounded-2xl border border-slate-700 bg-slate-800 p-5 sm:p-6';

export default function UserProfile({ user, username, profileLoading, profileError, onRetryProfile, setView }) {
    const { t, language } = useLanguage();
    const [draft, setDraft] = useState(null);
    const [saveState, setSaveState] = useState('');
    const mounted = useRef(false);
    const achievements = useProfileAchievements(user.uid);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const value = draft ?? (username || user.displayName || user.email?.split('@')[0] || '').substring(0, 18);
    const number = (amount) => new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(amount);
    const handleSave = async (event) => {
        event.preventDefault();
        if (saveState === 'saving') return;
        if (!value.trim() || value.trim().length > 18) { setSaveState('invalid'); return; }
        setSaveState('saving');
        try {
            const saved = await saveUsername(user.uid, value);
            if (mounted.current) { setDraft(saved); setSaveState('saved'); }
        } catch {
            if (mounted.current) setSaveState('failed');
        }
    };
    const records = [...(achievements.records || [])].sort((a, b) =>
        (b.completedAt?.toMillis?.() || 0) - (a.completedAt?.toMillis?.() || 0) || a.gameId.localeCompare(b.gameId));
    // Stable value sorting preserves newest-game precedence when award values tie.
    const groups = achievementTypes.map(([id, Icon]) => ({ id, Icon, entries: records.flatMap((record) =>
        (record.awards || []).filter((award) => award.id === id && award.value > 0).map((award) => ({ record, award })))
        .sort((a, b) => id === 'closestLate' ? a.award.value - b.award.value : b.award.value - a.award.value)
        .slice(0, 1)
    })).filter((group) => group.entries.length);

    return <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <button type="button" onClick={() => setView('menu')} className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white">
            <ArrowLeft size={20} />{t('backToMenu')}
        </button>
        <h1 className="mb-6 text-3xl font-bold">{t('myProfile')}</h1>
        <section className={`${panel} mb-6`}>
            {profileLoading ? <p role="status">{t('profileLoading')}</p> : profileError ? <div role="alert">
                <p>{t('profileLoadFailed')}</p>
                <button type="button" onClick={onRetryProfile} className="mt-3 rounded-lg bg-blue-600 px-4 py-2">{t('gameDataRetry')}</button>
            </div> : <form onSubmit={handleSave} className="space-y-3">
                <label htmlFor="profile-username" className="block font-bold">{t('profileUsername')}</label>
                <input id="profile-username" value={value} maxLength={18} autoComplete="nickname"
                    aria-describedby="profile-username-hint" aria-invalid={saveState === 'invalid'} disabled={saveState === 'saving'}
                    onChange={(event) => { setDraft(event.target.value); setSaveState(''); }}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 p-3 outline-none focus:border-blue-500" />
                <p id="profile-username-hint" className="text-sm text-slate-400">{t('profileUsernameHint')}</p>
                <button type="submit" disabled={saveState === 'saving'} className="rounded-lg bg-blue-600 px-5 py-2 font-bold hover:bg-blue-500 disabled:opacity-50">
                    {t(saveState === 'saving' ? 'profileSaving' : saveState === 'failed' ? 'profileRetrySave' : 'profileSave')}
                </button>
                {saveState === 'saved' && <p role="status" className="text-green-300">{t('profileSaved')}</p>}
                {['invalid', 'failed'].includes(saveState) && <p role="alert" className="text-red-300">{t(saveState === 'invalid' ? 'profileUsernameInvalid' : 'profileSaveFailed')}</p>}
            </form>}
        </section>
        <section className={panel}>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><Award aria-hidden="true" />{t('profileAchievements')}</h2>
            {achievements.loading && <p role="status">{t('profileAchievementsLoading')}</p>}
            {achievements.error && <div role="alert"><p>{t('profileAchievementsFailed')}</p>
                <button type="button" onClick={achievements.retry} className="mt-3 rounded-lg bg-blue-600 px-4 py-2">{t('gameDataRetry')}</button>
            </div>}
            {!achievements.loading && !achievements.error && !groups.length && <p className="text-slate-400">{t('profileNoAchievements')}</p>}
            <div className="grid gap-6 sm:grid-cols-2">{groups.map(({ id, Icon, entries }) => <section key={id} className="min-w-0">
                <h3 className="mb-3 flex items-center gap-2 font-bold"><Icon className="shrink-0 text-yellow-400" size={24} aria-hidden="true" />{t(`achievement_${id}`)}</h3>
                <ul>{entries.map(({ record, award }) => {
                    const details = award.details?.[user.uid];
                    const date = record.completedAt?.toDate?.();
                    const awardValue = award.unit === 'ratio' ? `${number(award.value * 100)}%` : award.unit === 'ms'
                        ? t('recapMilliseconds', { value: number(award.value) }) : t('recapCount', { count: number(award.value) });
                    return <li key={record.gameId} className="min-w-0 space-y-2 break-words rounded-xl bg-slate-900 p-4">
                        <p className="font-bold text-yellow-300">{awardValue}</p>
                        {id === 'accuracy' && details && <p className="text-sm text-slate-400">{number(details.correct)}/{number(details.answered)}</p>}
                        {id === 'closestLate' && details && <p className="text-sm text-slate-400">{details.categoryName}{details.questionPoints != null ? ` · ${t('scorePts', { score: number(details.questionPoints) })}` : ''}</p>}
                        {date && <time dateTime={date.toISOString()} className="block text-sm text-slate-400">{new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date)}</time>}
                        {/^(?:[A-Za-z0-9]{20}|[0-9]{6})$/.test(record.gameId) && <a href={`?game=${encodeURIComponent(record.gameId)}`} className="inline-block text-sm text-blue-300 underline hover:text-blue-200">{t('profileGameResults', { code: record.gameCode })}</a>}
                    </li>;
                })}</ul>
            </section>)}</div>
        </section>
    </main>;
}
