import { useEffect, useRef, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { X } from 'lucide-react';
import FirebaseSetupMissing from './components/FirebaseSetupMissing';
import { appId, auth, db, hasFirebaseConfig } from './firebase';
import LanguageProvider from './LanguageProvider';
import { clearImageKitAuthSession } from './services/imageStorage';
import { normalizeLanguage, translate } from './i18n';
import { getAuthErrorMessage } from './utils/errors';
import { hasDefinedFinalResults } from './utils/gameResults';
import Login from './views/Login';
import MainMenu from './views/MainMenu';
import PackCreator from './views/PackCreator';
import PackManager from './views/PackManager';
import HostSetup from './views/HostSetup';
import JoinRoom from './views/JoinRoom';
import GameRoom from './views/game/GameRoom';

const LAST_ROOM_CODE_KEY = 'cortex-rush:lastRoomCode';
const LANGUAGE_CACHE_KEY = 'cortex-rush:language';
const ROOM_STALE_SNAPSHOT_MS = 5000;
const ROOM_RECONCILE_INTERVAL_MS = 10000;
const getRoomCodeFromUrl = () => new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';
const getGameCodeFromUrl = () => new URLSearchParams(window.location.search).get('game')?.trim().toUpperCase() || '';
const replaceUrl = (url) => {
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};
const clearRoomCodeFromUrl = () => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('room')) return;

    url.searchParams.delete('room');
    replaceUrl(url);
};
const setGameCodeInUrl = (roomCode) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('game') === roomCode) return;

    url.searchParams.delete('room');
    url.searchParams.set('game', roomCode);
    replaceUrl(url);
};
const clearGameCodeFromUrl = () => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('game')) return;

    url.searchParams.delete('game');
    replaceUrl(url);
};
const saveUserLanguagePreference = (userId, language) => setDoc(
    doc(db, 'artifacts', appId, 'users', userId),
    { language, updatedAt: Date.now() },
    { merge: true }
);

export default function App() {
    const [user, setUser] = useState(null);
    const [authReady, setAuthReady] = useState(false);
    const [language, setLanguage] = useState(() => normalizeLanguage(localStorage.getItem(LANGUAGE_CACHE_KEY)));
    const [view, setView] = useState('menu'); // menu, createPack, managePacks, hostSetup, joinRoom, room
    const [joinRoomCode, setJoinRoomCode] = useState(() => getRoomCodeFromUrl());
    const [gameRoomCode, setGameRoomCode] = useState(() => getGameCodeFromUrl());
    const [linkedGameRoomCode, setLinkedGameRoomCode] = useState(() => getGameCodeFromUrl());
    const [latestActiveRoomCode, setLatestActiveRoomCode] = useState(() => localStorage.getItem(LAST_ROOM_CODE_KEY));
    const [currentRoomCode, setCurrentRoomCode] = useState(null);
    const [roomData, setRoomData] = useState(null);
    const [editingPack, setEditingPack] = useState(null);
    const [error, setError] = useState('');
    const roomSnapshotReceivedAtRef = useRef(0);
    const roomReconcilePromiseRef = useRef(null);

    useEffect(() => {
        if (!hasFirebaseConfig) return undefined;

        const unsubscribe = onAuthStateChanged(auth, (u) => {
            const isGoogleUser = u?.providerData?.some((provider) => provider.providerId === 'google.com');

            if (u && !isGoogleUser) {
                clearImageKitAuthSession();
                signOut(auth).catch((err) => {
                    console.error("Sign out error:", err);
                    setError(getAuthErrorMessage(err, language));
                });
                setUser(null);
                setError(translate(language, 'authGoogleRequired'));
            } else {
                setUser(u);
            }

            setAuthReady(true);
        });
        return () => unsubscribe();
    }, [language]);

    useEffect(() => {
        if (!hasFirebaseConfig || !user) {
            setLanguage(normalizeLanguage(localStorage.getItem(LANGUAGE_CACHE_KEY)));
            return undefined;
        }

        const userRef = doc(db, 'artifacts', appId, 'users', user.uid);
        const unsubscribe = onSnapshot(userRef, (snapshot) => {
            const nextLanguage = normalizeLanguage(snapshot.data()?.language);
            setLanguage(nextLanguage);
            localStorage.setItem(LANGUAGE_CACHE_KEY, nextLanguage);
        }, (err) => {
            console.error("Language preference sync error:", err);
        });

        return () => unsubscribe();
    }, [user]);

    const handleLanguageChange = async (nextLanguage) => {
        const normalizedLanguage = normalizeLanguage(nextLanguage);
        setLanguage(normalizedLanguage);
        localStorage.setItem(LANGUAGE_CACHE_KEY, normalizedLanguage);

        if (!user) return;

        try {
            await saveUserLanguagePreference(user.uid, normalizedLanguage);
        } catch (err) {
            console.error("Language preference save error:", err);
            setError(translate(normalizedLanguage, 'languageSaveFailed'));
        }
    };

    const handleGoogleSignIn = async () => {
        try {
            setError('');
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const loginLanguage = normalizeLanguage(localStorage.getItem(LANGUAGE_CACHE_KEY) || language);
            const credential = await signInWithPopup(auth, provider);
            try {
                await saveUserLanguagePreference(credential.user.uid, loginLanguage);
            } catch (err) {
                console.error("Language preference save error:", err);
                setError(translate(loginLanguage, 'languageSaveFailed'));
            }
        } catch (err) {
            console.error("Auth Error:", err);
            setError(getAuthErrorMessage(err, language));
        }
    };

    const handleSignOut = async () => {
        try {
            clearImageKitAuthSession();
            await signOut(auth);
            handleSetCurrentRoomCode(null);
            setRoomData(null);
            setEditingPack(null);
            setLatestActiveRoomCode(null);
            localStorage.removeItem(LAST_ROOM_CODE_KEY);
            clearGameCodeFromUrl();
            setLinkedGameRoomCode('');
            setView('menu');
        } catch (err) {
            console.error("Sign out error:", err);
            setError(getAuthErrorMessage(err, language));
        }
    };

    const handleSetCurrentRoomCode = (roomCode, { remember = true } = {}) => {
        setCurrentRoomCode(roomCode);

        if (roomCode && remember) {
            localStorage.setItem(LAST_ROOM_CODE_KEY, roomCode);
            setLatestActiveRoomCode(roomCode);
        } else {
            setLatestActiveRoomCode(localStorage.getItem(LAST_ROOM_CODE_KEY));
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
        const lastRoomCode = latestActiveRoomCode;
        if (!lastRoomCode) return;

        handleSetCurrentRoomCode(lastRoomCode);
        setView('room');
    };

    const handleLeaveGamePage = () => {
        handleSetCurrentRoomCode(null, { remember: false });
        setRoomData(null);
        setLinkedGameRoomCode('');
        clearGameCodeFromUrl();
        setView('menu');
    };

    const handleJoinRoomCodeConsumed = () => {
        setJoinRoomCode('');
        clearRoomCodeFromUrl();
    };

    useEffect(() => {
        if (!user || !gameRoomCode) return;

        handleSetCurrentRoomCode(gameRoomCode, { remember: false });
        setLinkedGameRoomCode(gameRoomCode);
        setRoomData(null);
        setView('room');
        setGameRoomCode('');
    }, [gameRoomCode, user]);

    useEffect(() => {
        if (!user || !joinRoomCode) return;

        setView('joinRoom');
    }, [joinRoomCode, user]);

    useEffect(() => {
        if (!hasFirebaseConfig || !user || !latestActiveRoomCode || currentRoomCode === latestActiveRoomCode) return undefined;

        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', latestActiveRoomCode);
        const unsubscribe = onSnapshot(roomRef, (snapshot) => {
            const room = snapshot.data();
            if (!snapshot.exists() || room.status === 'finished' || !room.players?.[user.uid]) {
                localStorage.removeItem(LAST_ROOM_CODE_KEY);
                setLatestActiveRoomCode(null);
            }
        }, (err) => {
            console.error("Latest room sync error:", err);
        });

        return () => unsubscribe();
    }, [currentRoomCode, latestActiveRoomCode, user]);

    // --- 2. Room Listener ---
    useEffect(() => {
        if (!hasFirebaseConfig || !user || !currentRoomCode) {
            roomSnapshotReceivedAtRef.current = 0;
            roomReconcilePromiseRef.current = null;
            return undefined;
        }

        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomCode);
        let isRoomListenerActive = true;
        const applyRoomSnapshot = (snapshot) => {
            if (snapshot.exists()) {
                const room = snapshot.data();
                const isParticipant = Boolean(room.players?.[user.uid]);
                const canSpectate = room.status === 'playing'
                    || room.status === 'finished'
                    || (linkedGameRoomCode === currentRoomCode && hasDefinedFinalResults(room));

                if (!isParticipant && !canSpectate) {
                    setError(translate(language, 'notGameParticipant'));
                    handleSetCurrentRoomCode(null, { remember: false });
                    setRoomData(null);
                    setLinkedGameRoomCode('');
                    localStorage.removeItem(LAST_ROOM_CODE_KEY);
                    setLatestActiveRoomCode(null);
                    clearGameCodeFromUrl();
                    setView('menu');
                    return;
                }

                setRoomData(room);

                if (room.status === 'finished' || (linkedGameRoomCode === currentRoomCode && hasDefinedFinalResults(room))) {
                    localStorage.removeItem(LAST_ROOM_CODE_KEY);
                    setLatestActiveRoomCode(null);
                    return;
                }

                if (isParticipant) {
                    localStorage.setItem(LAST_ROOM_CODE_KEY, currentRoomCode);
                    setLatestActiveRoomCode(currentRoomCode);
                } else {
                    localStorage.removeItem(LAST_ROOM_CODE_KEY);
                    setLatestActiveRoomCode(null);
                }

                if (view === 'room') {
                    setGameCodeInUrl(currentRoomCode);
                }
            } else {
                setError(translate(language, 'roomClosed'));
                handleSetCurrentRoomCode(null, { remember: false });
                setLinkedGameRoomCode('');
                localStorage.removeItem(LAST_ROOM_CODE_KEY);
                setLatestActiveRoomCode(null);
                setRoomData(null);
                clearGameCodeFromUrl();
                setView('menu');
            }
        };
        const reconcileRoomFromServer = async ({ force = false } = {}) => {
            if (document.hidden) return;

            const elapsedMs = Date.now() - roomSnapshotReceivedAtRef.current;
            if (!force && roomSnapshotReceivedAtRef.current && elapsedMs < ROOM_STALE_SNAPSHOT_MS) return;
            if (roomReconcilePromiseRef.current) return;

            const reconcilePromise = getDocFromServer(roomRef)
                .then((serverSnapshot) => {
                    if (!isRoomListenerActive) return;

                    roomSnapshotReceivedAtRef.current = Date.now();
                    applyRoomSnapshot(serverSnapshot);
                })
                .catch((err) => {
                    console.error("Room server reconcile error:", err);
                })
                .finally(() => {
                    if (roomReconcilePromiseRef.current === reconcilePromise) {
                        roomReconcilePromiseRef.current = null;
                    }
                });
            roomReconcilePromiseRef.current = reconcilePromise;

            await roomReconcilePromiseRef.current;
        };
        const reconcileOnVisible = () => {
            if (!document.hidden) {
                reconcileRoomFromServer({ force: true });
            }
        };
        const unsubscribe = onSnapshot(roomRef, (snapshot) => {
            roomSnapshotReceivedAtRef.current = Date.now();
            applyRoomSnapshot(snapshot);
        }, (err) => {
            console.error("Room sync error:", err);
            setError(translate(language, 'roomSyncLost'));
        });
        const intervalId = window.setInterval(() => reconcileRoomFromServer(), ROOM_RECONCILE_INTERVAL_MS);

        document.addEventListener('visibilitychange', reconcileOnVisible);
        window.addEventListener('focus', reconcileOnVisible);
        window.addEventListener('online', reconcileOnVisible);
        window.addEventListener('pageshow', reconcileOnVisible);

        return () => {
            isRoomListenerActive = false;
            unsubscribe();
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', reconcileOnVisible);
            window.removeEventListener('focus', reconcileOnVisible);
            window.removeEventListener('online', reconcileOnVisible);
            window.removeEventListener('pageshow', reconcileOnVisible);
        };
    }, [user, currentRoomCode, language, view, linkedGameRoomCode]);

    if (!hasFirebaseConfig) {
        return <FirebaseSetupMissing />;
    }

    if (!authReady) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                <div className="sr-only">{translate(language, 'authLoading')}</div>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!user) {
        return (
            <LanguageProvider language={language} setLanguage={handleLanguageChange}>
                <Login
                    error={error}
                    pendingRoomCode={joinRoomCode}
                    onDismissError={() => setError('')}
                    onSignIn={handleGoogleSignIn}
                />
            </LanguageProvider>
        );
    }

    // --- Main Navigation ---
    return (
        <LanguageProvider language={language} setLanguage={handleLanguageChange}>
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
                    lastRoomCode={latestActiveRoomCode}
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
                    onCodeConsumed={handleJoinRoomCodeConsumed}
                />
            )}

            {view === 'room' && roomData && (
                <GameRoom
                    room={roomData}
                    roomCode={currentRoomCode}
                    user={user}
                    onLeaveRoom={handleLeaveGamePage}
                    showDefinedFinalResults={linkedGameRoomCode === currentRoomCode}
                />
            )}
        </div>
        </LanguageProvider>
    );
}
