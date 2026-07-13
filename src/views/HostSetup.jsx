import { useEffect, useState } from 'react';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { ArrowLeft, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { HOST_AVATAR } from '../constants';
import PackTitle from '../components/PackTitle';
import { appId, db } from '../firebase';
import { getPackAnalyticsSummary, trackEvent } from '../services/analytics';
import { useLanguage } from '../useLanguage';
import { generateRoomCode } from '../utils/ids';
import { createHistoryItem } from '../actions/gameActions';

const sortPacksByUpdatedAt = (packs) => packs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

function PackCard({ pack, onStartRoom, t }) {
    return (
        <div className="flex flex-col rounded-xl border border-slate-600 bg-slate-800 p-5 transition-colors hover:border-purple-500">
            <h4 className="mb-1 text-lg font-bold">
                <PackTitle pack={pack} iconClassName="text-xl" />
            </h4>
            <p className="mb-2 text-sm text-slate-400">
                {t('packStats', {
                    categories: pack.categories?.length || 0,
                    questions: pack.categories?.reduce((acc, c) => acc + (c.questions?.length || 0), 0)
                })}
            </p>
            <p className="mb-4 text-xs text-slate-500">
                {t('byAuthor', { author: pack.ownerEmail || t('unknownAuthor') })}
            </p>
            <button
                onClick={() => onStartRoom(pack)}
                className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 font-bold hover:bg-purple-500"
            >
                <Play size={18} /> {t('startRoom')}
            </button>
        </div>
    );
}

function PackSection({ id, title, packs, isCollapsed, emptyMessage, onToggle, onStartRoom, onCreatePack, t }) {
    const toggleLabel = isCollapsed ? t('expandPackSection', { section: title }) : t('collapsePackSection', { section: title });

    return (
        <section className="rounded-xl border border-slate-700 bg-slate-800/40">
            <button
                type="button"
                onClick={() => onToggle(id)}
                aria-expanded={!isCollapsed}
                aria-label={toggleLabel}
                title={toggleLabel}
                className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-slate-800/70"
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300">
                    {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                </span>
                <span className="min-w-0 flex-1 text-lg font-black text-white">{title}</span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm font-bold text-slate-300">
                    {packs.length}
                </span>
            </button>

            {!isCollapsed && (
                <div className="border-t border-slate-700 p-5">
                    {packs.length === 0 ? (
                        <div className="rounded-xl border-2 border-dashed border-slate-700 p-8 text-center">
                            <p className="mb-4 text-slate-400">{emptyMessage}</p>
                            {onCreatePack && (
                                <button
                                    onClick={onCreatePack}
                                    className="rounded-lg bg-blue-600 px-6 py-2 font-bold text-white hover:bg-blue-500"
                                >
                                    {t('createOneNow')}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {packs.map((pack) => (
                                <PackCard key={pack.id} pack={pack} onStartRoom={onStartRoom} t={t} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

export default function HostSetup({ setView, user, setCurrentRoomCode, onCreatePack }) {
    const { t } = useLanguage();
    const [ownedPacks, setOwnedPacks] = useState([]);
    const [sharedPacks, setSharedPacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hostName, setHostName] = useState(() => t('hostLabel'));
    const [collapsedSections, setCollapsedSections] = useState({ owned: false, shared: false });

    useEffect(() => {
        const fetchPacks = async () => {
            setLoading(true);
            try {
                const packsRef = collection(db, 'artifacts', appId, 'public', 'data', 'packs');
                const [ownedSnapshot, publicSnapshot] = await Promise.all([
                    getDocs(query(packsRef, where('ownerId', '==', user.uid))),
                    getDocs(query(packsRef, where('isPublic', '==', true)))
                ]);

                const nextOwnedPacks = [];
                ownedSnapshot.forEach((packDoc) => nextOwnedPacks.push({ id: packDoc.id, ...packDoc.data() }));

                const ownedPackIds = new Set(nextOwnedPacks.map((pack) => pack.id));
                const nextSharedPacks = [];
                publicSnapshot.forEach((packDoc) => {
                    const pack = { id: packDoc.id, ...packDoc.data() };
                    if (pack.ownerId !== user.uid && !ownedPackIds.has(pack.id)) {
                        nextSharedPacks.push(pack);
                    }
                });

                setOwnedPacks(sortPacksByUpdatedAt(nextOwnedPacks));
                setSharedPacks(sortPacksByUpdatedAt(nextSharedPacks));
                setCollapsedSections((currentSections) => ({
                    ...currentSections,
                    owned: nextOwnedPacks.length === 0
                }));
            } catch (err) {
                console.error("Error fetching packs", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPacks();
    }, [user.uid]);

    const toggleSection = (sectionId) => {
        setCollapsedSections((currentSections) => ({
            ...currentSections,
            [sectionId]: !currentSections[sectionId]
        }));
    };

    const handleStartRoom = async (pack) => {
        const code = generateRoomCode();

        // Initialize question states map
        const qStates = {};
        pack.categories.forEach(cat => {
            cat.questions.forEach(q => {
                qStates[q.id] = 'available';
            });
        });

        const roomData = {
            hostId: user.uid,
            packId: pack.id,
            status: 'lobby',
            pack: pack,
            players: {
                [user.uid]: { name: hostName, score: 0, isHost: true, avatar: HOST_AVATAR }
            },
            questionStates: qStates,
            currentTurn: null,
            activeQuestionId: null,
            answerRevealed: false,
            buzzedPlayerId: null,
            buzzTimestamp: null,
            buzzUnlockAt: null,
            buzzAttempts: {},
            incorrectBuzzedIds: [],
            mediaPlayback: null,
            prizeModal: null,
            surprisePlayerDraw: null,
            surpriseRound: null,
            history: [
                createHistoryItem({
                    type: 'room_created',
                    actorId: user.uid,
                    actorName: hostName,
                    message: t('historyRoomCreated', { hostName }),
                    details: { hostName }
                })
            ]
        };

        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', code), roomData);
            trackEvent('room_created', getPackAnalyticsSummary(pack));
            setCurrentRoomCode(code);
            setView('room');
        } catch (err) {
            console.error("Error creating room", err);
            alert(t('failedToCreateRoom'));
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="flex items-center mb-8">
                <button onClick={() => setView('menu')} className="p-2 mr-4 hover:bg-slate-800 rounded-full transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-3xl font-bold">{t('hostGame')}</h2>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-8">
                <label className="block text-sm font-medium text-slate-400 mb-2">{t('yourHostName')}</label>
                <input
                    type="text"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    maxLength={18}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white outline-none"
                />
            </div>

            <h3 className="text-xl font-bold mb-4 text-slate-300">{t('selectQuestionPack')}</h3>

            {loading ? (
                <div className="text-center p-8 text-slate-500 animate-pulse">{t('loadingPacks')}</div>
            ) : (
                <div className="space-y-6">
                    <PackSection
                        id="owned"
                        title={t('myQuestionPacks')}
                        packs={ownedPacks}
                        isCollapsed={collapsedSections.owned}
                        emptyMessage={t('noOwnedPacksForHosting')}
                        onToggle={toggleSection}
                        onStartRoom={handleStartRoom}
                        onCreatePack={onCreatePack}
                        t={t}
                    />
                    <PackSection
                        id="shared"
                        title={t('sharedQuestionPacks')}
                        packs={sharedPacks}
                        isCollapsed={collapsedSections.shared}
                        emptyMessage={t('noSharedPacks')}
                        onToggle={toggleSection}
                        onStartRoom={handleStartRoom}
                        t={t}
                    />
                </div>
            )}
        </div>
    );
}
