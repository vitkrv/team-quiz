import { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { RefreshCw, X } from 'lucide-react';
import useRoomSubscription from './hooks/useRoomSubscription';
import FirebaseSetupMissing from './components/FirebaseSetupMissing';
import { appId, auth, db, hasFirebaseConfig } from './firebase';
import LanguageProvider from './LanguageProvider';
import { setAnalyticsUserContext, trackEvent, trackPageView } from './services/analytics';
import { clearImageKitAuthSession } from './services/imageStorage';
import { normalizeLanguage, translate } from './i18n';
import { getAuthErrorMessage } from './utils/errors';
import { hasDefinedFinalResults } from './utils/gameResults';
import Login from './views/Login';
import MainMenu from './views/MainMenu';
import UserProfile from './views/UserProfile';
import PackCreator from './views/PackCreator';
import PackManager from './views/PackManager';
import HostSetup from './views/HostSetup';
import JoinRoom from './views/JoinRoom';
import GameRoom from './views/game/GameRoom';

const LAST_ROOM_CODE_KEY = 'cortex-rush:lastRoomCode';
const LANGUAGE_CACHE_KEY = 'cortex-rush:language';
const getRoomCodeFromUrl = () => new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';
// Game IDs are case-sensitive; six-digit IDs keep legacy results links working.
const isRoomId = (id) => /^(?:[A-Za-z0-9]{20}|[0-9]{6})$/.test(id || '');
const getGameCodeFromUrl = () => {
    const id = new URLSearchParams(window.location.search).get('game')?.trim() || '';
    return isRoomId(id) ? id : '';
};
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
    const [profile, setProfile] = useState(null);
    const [profileAttempt, setProfileAttempt] = useState(0);
    const profileUserIdRef = useRef(null);
    const currentProfile = profile?.userId === user?.uid ? profile : null;
    const username = currentProfile?.username || null;
    const [authReady, setAuthReady] = useState(false);
    const [language, setLanguage] = useState(() => normalizeLanguage(localStorage.getItem(LANGUAGE_CACHE_KEY)));
    const [view, setView] = useState('menu'); // menu, profile, createPack, managePacks, hostSetup, joinRoom, room
    const [joinRoomCode, setJoinRoomCode] = useState(() => getRoomCodeFromUrl());
    const [gameRoomCode, setGameRoomCode] = useState(() => getGameCodeFromUrl());
    const [linkedGameRoomCode, setLinkedGameRoomCode] = useState(() => getGameCodeFromUrl());
    const [latestActiveRoomCode, setLatestActiveRoomCode] = useState(() => {
        const id = localStorage.getItem(LAST_ROOM_CODE_KEY);
        return isRoomId(id) ? id : null;
    });
    const [latestInvitationCode, setLatestInvitationCode] = useState('');
    // Room state and remembered-room storage contain stable document IDs.
    const [currentRoomCode, setCurrentRoomCode] = useState(null);
    const [roomData, setRoomData] = useState(null);
    const [editingPack, setEditingPack] = useState(null);
    const [error, setError] = useState('');
    const activeRoomRef = useMemo(() => hasFirebaseConfig && user?.uid && currentRoomCode
        ? doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomCode)
        : null, [user?.uid, currentRoomCode]);
    const roomSync = useRoomSubscription(activeRoomRef, user?.uid);
    const roomSnapshot = roomSync.snapshot;
    const expectedRoomExitCodeRef = useRef(null);

    useEffect(() => {
        if (!authReady) return;

        setAnalyticsUserContext({ signedIn: Boolean(user) });
    }, [authReady, user]);

    useEffect(() => {
        if (!authReady) return;

        trackPageView(user ? view : 'login');
    }, [authReady, user, view]);

    useEffect(() => {
        if (!hasFirebaseConfig) return undefined;

        const unsubscribe = onAuthStateChanged(auth, (u) => {
            if (profileUserIdRef.current !== (u?.uid || null)) {
                setProfile(null);
                profileUserIdRef.current = u?.uid || null;
            }
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
        let active = true;
        const unsubscribe = onSnapshot(userRef, (snapshot) => {
            if (!active) return;
            setProfile({ userId: user.uid, username: snapshot.data()?.username || null });
            const nextLanguage = normalizeLanguage(snapshot.data()?.language);
            setLanguage(nextLanguage);
            localStorage.setItem(LANGUAGE_CACHE_KEY, nextLanguage);
        }, (err) => {
            if (!active) return;
            setProfile({ userId: user.uid, error: err });
            console.error("User preference sync error:", err);
        });

        return () => { active = false; unsubscribe(); };
    }, [user, profileAttempt]);

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
            trackEvent('login', { method: 'google' });
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
            trackEvent('sign_out');
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

    const handlePrepareRoomExit = (roomCode) => {
        expectedRoomExitCodeRef.current = roomCode;
    };

    const handleLeaveGamePage = ({ clearRemembered = false } = {}) => {
        expectedRoomExitCodeRef.current = null;
        if (clearRemembered) {
            localStorage.removeItem(LAST_ROOM_CODE_KEY);
        }
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
            setLatestInvitationCode(room?.roomCode || latestActiveRoomCode);
            if (!snapshot.exists() || room.status === 'finished' || !room.players?.[user.uid]) {
                localStorage.removeItem(LAST_ROOM_CODE_KEY);
                setLatestActiveRoomCode(null);
            }
        }, (err) => {
            console.error("Latest room sync error:", err);
        });

        return () => unsubscribe();
    }, [currentRoomCode, latestActiveRoomCode, user]);

    // Subscription lifecycle is independent of navigation and translation effects.
    useEffect(() => {
        if (!user || !currentRoomCode || !roomSnapshot) return;
        const serverConfirmed = !roomSnapshot.metadata.fromCache && !roomSnapshot.metadata.hasPendingWrites;
        const applyRoomSnapshot = (snapshot) => {
            if (snapshot.exists()) {
                const room = snapshot.data();
                const isParticipant = Boolean(room.players?.[user.uid]);
                const hasLinkedDefinedFinalResults = linkedGameRoomCode === currentRoomCode
                    && !isParticipant
                    && hasDefinedFinalResults(room);
                const canSpectate = room.status === 'category_preview'
                    || room.status === 'playing'
                    || room.status === 'finished'
                    || hasLinkedDefinedFinalResults;

                if (serverConfirmed && !isParticipant && !canSpectate) {
                    if (expectedRoomExitCodeRef.current === currentRoomCode) {
                        expectedRoomExitCodeRef.current = null;
                    } else {
                        setError(translate(language, 'notGameParticipant'));
                    }
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
                setLatestInvitationCode(room.roomCode || currentRoomCode);

                if (view === 'room') {
                    setGameCodeInUrl(currentRoomCode);
                }

                if (!serverConfirmed) return;

                if (room.status === 'finished' || hasLinkedDefinedFinalResults) {
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

            } else if (serverConfirmed) {
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
        applyRoomSnapshot(roomSnapshot);
    }, [roomSnapshot, user, currentRoomCode, language, view, linkedGameRoomCode]);

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

            {view === 'room' && currentRoomCode && ['reconnecting', 'failed', 'blocked'].includes(roomSync.status) && (
                <div role="status" className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-amber-950 px-4 py-3 text-amber-100">
                    <span>{translate(language, roomSync.status === 'blocked'
                        ? (['permission-denied', 'unauthenticated'].includes(roomSync.errorCode) ? 'roomSyncAccessError' : 'roomSyncRequestError')
                        : roomSync.status === 'failed' ? 'roomSyncFailed' : 'roomSyncReconnecting')}</span>
                    <button type="button" onClick={roomSync.reconnect} className="flex items-center gap-2 rounded border border-amber-300/50 px-3 py-1 hover:bg-amber-900">
                        <RefreshCw size={16} />{translate(language, 'roomSyncReconnect')}
                    </button>
                </div>
            )}

            {view === 'menu' && (
                <MainMenu
                    setView={setView}
                    user={user}
                    username={username}
                    lastRoomCode={latestActiveRoomCode ? latestInvitationCode : ''}
                    onCreatePack={handleCreatePack}
                    onReturnToRoom={handleReturnToRoom}
                    onSignOut={handleSignOut}
                />
            )}

            {view === 'profile' && <UserProfile key={user.uid} user={user} username={username}
                profileLoading={!currentProfile} profileError={currentProfile?.error}
                onRetryProfile={() => { setProfile(null); setProfileAttempt((value) => value + 1); }} setView={setView} />}

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
                    key={user.uid}
                    username={username}
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
                    onPrepareRoomExit={handlePrepareRoomExit}
                    onLeaveRoom={handleLeaveGamePage}
                    showDefinedFinalResults={linkedGameRoomCode === currentRoomCode}
                />
            )}
        </div>
        </LanguageProvider>
    );
}
