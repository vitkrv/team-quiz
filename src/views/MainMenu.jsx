import { FolderOpen, LogOut, RotateCcw } from 'lucide-react';
import packageJson from '../../package.json';
import { useLanguage } from '../useLanguage';
import LanguagePicker from '../components/LanguagePicker';

export default function MainMenu({ setView, user, lastRoomCode, onCreatePack, onReturnToRoom, onSignOut }) {
    const { t } = useLanguage();

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

            <LanguagePicker className="absolute bottom-6 left-1/2 -translate-x-1/2" />
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] leading-none text-slate-500/60">
                {packageJson.version}
            </div>
        </div>
    );
}
