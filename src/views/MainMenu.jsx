import { FolderOpen, LogOut, RotateCcw } from 'lucide-react';

export default function MainMenu({ setView, user, lastRoomCode, onCreatePack, onReturnToRoom, onSignOut }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
            <div className="absolute top-4 right-4 flex items-center gap-3">
                <div className="text-right hidden sm:block">
                    <div className="text-sm font-bold text-slate-200">{user.displayName || 'Player'}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                </div>
                <button
                    onClick={onSignOut}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    title="Sign out"
                >
                    <LogOut size={20} />
                </button>
            </div>

            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2 text-center tracking-tight">
                Q&A SHOWDOWN
            </h1>
            <p className="text-slate-400 mb-12 text-lg text-center max-w-md">
                Create custom trivia packs, host a game room, and challenge your friends in real-time.
            </p>

            <div className="space-y-4 w-full max-w-sm">
                {lastRoomCode && (
                    <button
                        onClick={onReturnToRoom}
                        className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                    >
                        <RotateCcw size={20} /> Return to Room {lastRoomCode}
                    </button>
                )}
                <button
                    onClick={() => setView('joinRoom')}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-500/20"
                >
                    Join a Game
                </button>
                <button
                    onClick={() => setView('hostSetup')}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-purple-500/20"
                >
                    Host a Game
                </button>
                <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700"></div></div>
                    <div className="relative flex justify-center"><span className="bg-slate-900 px-4 text-sm text-slate-500">OR</span></div>
                </div>
                <button
                    onClick={onCreatePack}
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white py-4 rounded-xl font-bold text-lg transition-all"
                >
                    Create Question Pack
                </button>
                <button
                    onClick={() => setView('managePacks')}
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2"
                >
                    <FolderOpen size={20} /> My Question Packs
                </button>
            </div>
        </div>
    );
}
