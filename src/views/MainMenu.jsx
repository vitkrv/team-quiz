import { FolderOpen, LogOut, RotateCcw } from 'lucide-react';
import { useLanguage } from '../useLanguage';
import { LANGUAGES } from '../i18n';

const Star = ({ x, y, r }) => {
    const points = Array.from({ length: 10 }, (_, index) => {
        const angle = -90 + index * 36;
        const radius = index % 2 === 0 ? r : r * 0.38;
        const px = x + radius * Math.cos(angle * Math.PI / 180);
        const py = y + radius * Math.sin(angle * Math.PI / 180);
        return `${px},${py}`;
    }).join(' ');

    return <polygon points={points} fill="#fff" />;
};

const UnitedStatesFlag = () => (
    <svg viewBox="0 0 7410 3900" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
        <rect width="7410" height="3900" fill="#b22234" />
        {Array.from({ length: 6 }, (_, index) => (
            <rect key={index} y={(index * 2 + 1) * 300} width="7410" height="300" fill="#fff" />
        ))}
        <rect width="2964" height="2100" fill="#3c3b6e" />
        {Array.from({ length: 9 }, (_, row) => (
            Array.from({ length: row % 2 === 0 ? 6 : 5 }, (_, col) => (
                <Star
                    key={`${row}-${col}`}
                    x={(row % 2 === 0 ? 247 : 494) + col * 494}
                    y={210 + row * 210}
                    r={90}
                />
            ))
        ))}
    </svg>
);

const UkraineFlag = () => (
    <svg viewBox="0 0 1200 800" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
        <rect width="1200" height="400" fill="#0057b7" />
        <rect y="400" width="1200" height="400" fill="#ffd700" />
    </svg>
);

const LanguageFlag = ({ code }) => {
    if (code === 'en') return <UnitedStatesFlag />;
    if (code === 'uk') return <UkraineFlag />;
    return null;
};

export default function MainMenu({ setView, user, lastRoomCode, onCreatePack, onReturnToRoom, onSignOut }) {
    const { language, setLanguage, t } = useLanguage();

    return (
        <div className="relative flex flex-col items-center justify-center min-h-screen p-6 pb-28">
            <div className="absolute top-4 right-4 flex items-center gap-3">
                <div className="text-right hidden sm:block">
                    <div className="text-sm font-bold text-slate-200">{user.displayName || t('playerFallback')}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                </div>
                <button
                    onClick={onSignOut}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    title={t('signOut')}
                >
                    <LogOut size={20} />
                </button>
            </div>

            <h1 className="cortex-title mb-3 text-center text-5xl font-black uppercase sm:text-7xl" aria-label="Cortex Rush">
                <span className="cortex-title__streak cortex-title__streak--top" aria-hidden="true" />
                <span className="cortex-title__streak cortex-title__streak--bottom" aria-hidden="true" />
                <span className="cortex-title__word cortex-title__word--cortex">Cortex</span>
                <span className="cortex-title__bolt" aria-hidden="true" />
                <span className="cortex-title__word cortex-title__word--rush">Rush</span>
            </h1>
            <p className="text-slate-400 mb-12 text-lg text-center max-w-md">
                {t('mainMenuDescription')}
            </p>

            <div className="space-y-4 w-full max-w-sm">
                {lastRoomCode && (
                    <button
                        onClick={onReturnToRoom}
                        className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                    >
                        <RotateCcw size={20} /> {t('returnToRoom', { roomCode: lastRoomCode })}
                    </button>
                )}
                <button
                    onClick={() => setView('joinRoom')}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-500/20"
                >
                    {t('joinGame')}
                </button>
                <button
                    onClick={() => setView('hostSetup')}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-purple-500/20"
                >
                    {t('hostGame')}
                </button>
                <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700"></div></div>
                    <div className="relative flex justify-center"><span className="bg-slate-900 px-4 text-sm text-slate-500">{t('or')}</span></div>
                </div>
                <button
                    onClick={onCreatePack}
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white py-4 rounded-xl font-bold text-lg transition-all"
                >
                    {t('createQuestionPack')}
                </button>
                <button
                    onClick={() => setView('managePacks')}
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2"
                >
                    <FolderOpen size={20} /> {t('myQuestionPacks')}
                </button>
            </div>

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('interfaceLanguage')}</div>
                <div className="flex items-center gap-3 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-2 shadow-lg">
                    {LANGUAGES.map((item) => (
                        <button
                            key={item.code}
                            type="button"
                            onClick={() => setLanguage(item.code)}
                            className={`h-9 w-14 overflow-hidden rounded-md border border-slate-700 bg-slate-900 transition-all hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400 ${language === item.code ? 'ring-2 ring-blue-400' : ''}`}
                            title={item.label}
                            aria-label={item.label}
                            aria-pressed={language === item.code}
                        >
                            <LanguageFlag code={item.code} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
