export default function FirebaseSetupMissing() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
                <h1 className="text-3xl font-black text-white mb-3">Firebase setup required</h1>
                <p className="text-slate-300 mb-6">
                    Q&A Showdown needs a Firebase web app configuration before multiplayer rooms and question packs can sync.
                </p>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm font-mono text-slate-300 overflow-x-auto">
                    <div>VITE_FIREBASE_API_KEY=...</div>
                    <div>VITE_FIREBASE_AUTH_DOMAIN=...</div>
                    <div>VITE_FIREBASE_PROJECT_ID=...</div>
                    <div>VITE_FIREBASE_STORAGE_BUCKET=...</div>
                    <div>VITE_FIREBASE_MESSAGING_SENDER_ID=...</div>
                    <div>VITE_FIREBASE_APP_ID=...</div>
                </div>
                <p className="text-slate-500 text-sm mt-4">
                    Create a local .env file from .env.example, then restart the dev server.
                </p>
            </div>
        </div>
    );
}
