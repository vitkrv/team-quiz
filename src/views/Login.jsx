import { LogIn, X } from 'lucide-react';

export default function Login({ error, pendingRoomCode, onDismissError, onSignIn }) {
    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
            {error && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-xl z-50 flex items-center gap-2">
                    <span>{error}</span>
                    <button onClick={onDismissError} className="hover:text-red-200"><X size={18} /></button>
                </div>
            )}

            <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl text-center">
                <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-3">
                    Q&A SHOWDOWN
                </h1>
                <p className="text-slate-400 mb-8">
                    {pendingRoomCode
                        ? `Sign in with Google to join room ${pendingRoomCode}.`
                        : 'Sign in with Google to create packs, host rooms, and join games.'}
                </p>
                <button
                    onClick={onSignIn}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                >
                    <LogIn size={20} /> Sign in with Google
                </button>
            </div>
        </div>
    );
}
