import { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { X } from 'lucide-react';
import FirebaseSetupMissing from './components/FirebaseSetupMissing';
import { appId, auth, db, hasFirebaseConfig } from './firebase';
import { getAuthErrorMessage } from './utils/errors';
import Login from './views/Login';
import MainMenu from './views/MainMenu';
import PackCreator from './views/PackCreator';
import PackManager from './views/PackManager';
import HostSetup from './views/HostSetup';
import JoinRoom from './views/JoinRoom';
import GameRoom from './views/game/GameRoom';

const LAST_ROOM_CODE_KEY = 'qa-showdown:lastRoomCode';
const getRoomCodeFromUrl = () => new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';

export default function App() {
    const [user, setUser] = useState(null);
    const [authReady, setAuthReady] = useState(false);
    const [view, setView] = useState('menu'); // menu, createPack, managePacks, hostSetup, joinRoom, room
    const [joinRoomCode, setJoinRoomCode] = useState(() => getRoomCodeFromUrl());
    const [currentRoomCode, setCurrentRoomCode] = useState(null);
    const [roomData, setRoomData] = useState(null);
    const [editingPack, setEditingPack] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!hasFirebaseConfig) return undefined;

        const unsubscribe = onAuthStateChanged(auth, (u) => {
            const isGoogleUser = u?.providerData?.some((provider) => provider.providerId === 'google.com');

            if (u && !isGoogleUser) {
                signOut(auth).catch((err) => {
                    console.error("Sign out error:", err);
                    setError(getAuthErrorMessage(err));
                });
                setUser(null);
                setError('Please sign in with Google to use Q&A Showdown.');
            } else {
                setUser(u);
            }

            setAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    const handleGoogleSignIn = async () => {
        try {
            setError('');
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await signInWithPopup(auth, provider);
        } catch (err) {
            console.error("Auth Error:", err);
            setError(getAuthErrorMessage(err));
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            handleSetCurrentRoomCode(null);
            setRoomData(null);
            setEditingPack(null);
            setView('menu');
        } catch (err) {
            console.error("Sign out error:", err);
            setError(getAuthErrorMessage(err));
        }
    };

    const handleSetCurrentRoomCode = (roomCode) => {
        setCurrentRoomCode(roomCode);

        if (roomCode) {
            localStorage.setItem(LAST_ROOM_CODE_KEY, roomCode);
        } else {
            localStorage.removeItem(LAST_ROOM_CODE_KEY);
        }
    };

    const handleCreatePack = () => {
        setEditingPack(null);
        setView('createPack');
    };

    const handleEditPack = (pack) => {
        setEditingPack(pack);
        setView('createPack');
    };

    const handleReturnToRoom = () => {
        const lastRoomCode = localStorage.getItem(LAST_ROOM_CODE_KEY);
        if (!lastRoomCode) return;

        handleSetCurrentRoomCode(lastRoomCode);
        setView('room');
    };

    useEffect(() => {
        if (!user || !joinRoomCode) return;

        setView('joinRoom');
    }, [joinRoomCode, user]);

    // --- 2. Room Listener ---
    useEffect(() => {
        if (!hasFirebaseConfig || !user || !currentRoomCode) return undefined;

        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomCode);
        const unsubscribe = onSnapshot(roomRef, (snapshot) => {
            if (snapshot.exists()) {
                setRoomData(snapshot.data());
            } else {
                setError("Room was closed or does not exist.");
                handleSetCurrentRoomCode(null);
                setView('menu');
            }
        }, (err) => {
            console.error("Room sync error:", err);
            setError("Lost connection to the game room.");
        });

        return () => unsubscribe();
    }, [user, currentRoomCode]);

    if (!hasFirebaseConfig) {
        return <FirebaseSetupMissing />;
    }

    if (!authReady) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!user) {
        return (
            <Login
                error={error}
                pendingRoomCode={joinRoomCode}
                onDismissError={() => setError('')}
                onSignIn={handleGoogleSignIn}
            />
        );
    }

    // --- Main Navigation ---
    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-blue-500/30">
            {error && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-xl z-50 flex items-center gap-2">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="hover:text-red-200"><X size={18} /></button>
                </div>
            )}

            {view === 'menu' && (
                <MainMenu
                    setView={setView}
                    user={user}
                    lastRoomCode={localStorage.getItem(LAST_ROOM_CODE_KEY)}
                    onCreatePack={handleCreatePack}
                    onReturnToRoom={handleReturnToRoom}
                    onSignOut={handleSignOut}
                />
            )}

            {view === 'createPack' && (
                <PackCreator
                    pack={editingPack}
                    setView={setView}
                    user={user}
                    setError={setError}
                    onSaved={() => {
                        setEditingPack(null);
                        setView('menu');
                    }}
                />
            )}

            {view === 'managePacks' && (
                <PackManager
                    setView={setView}
                    user={user}
                    setError={setError}
                    onCreatePack={handleCreatePack}
                    onEditPack={handleEditPack}
                />
            )}

            {view === 'hostSetup' && (
                <HostSetup
                    setView={setView}
                    user={user}
                    setCurrentRoomCode={handleSetCurrentRoomCode}
                    onCreatePack={handleCreatePack}
                />
            )}

            {view === 'joinRoom' && (
                <JoinRoom
                    initialCode={joinRoomCode}
                    setView={setView}
                    user={user}
                    setCurrentRoomCode={handleSetCurrentRoomCode}
                    setError={setError}
                    onCodeConsumed={() => setJoinRoomCode('')}
                />
            )}

            {view === 'room' && roomData && (
                <GameRoom
                    room={roomData}
                    roomCode={currentRoomCode}
                    user={user}
                    setView={setView}
                    setCurrentRoomCode={handleSetCurrentRoomCode}
                />
            )}
        </div>
    );
}
