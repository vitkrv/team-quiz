import { useEffect, useState } from 'react';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { ArrowLeft, Play } from 'lucide-react';
import { ANIMAL_AVATARS } from '../constants';
import { appId, db } from '../firebase';
import { useLanguage } from '../useLanguage';
import { generateRoomCode } from '../utils/ids';
import { createHistoryItem } from '../actions/gameActions';

export default function HostSetup({ setView, user, setCurrentRoomCode, onCreatePack }) {
    const { t } = useLanguage();
    const [packs, setPacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hostName, setHostName] = useState(() => t('hostLabel'));

    useEffect(() => {
        const fetchPacks = async () => {
            try {
                const packsRef = collection(db, 'artifacts', appId, 'public', 'data', 'packs');
                const snapshot = await getDocs(packsRef);
                const loadedPacks = [];
                snapshot.forEach(doc => loadedPacks.push({ id: doc.id, ...doc.data() }));
                setPacks(loadedPacks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
            } catch (err) {
                console.error("Error fetching packs", err);
            }
            setLoading(false);
        };
        fetchPacks();
    }, [user]);

    const handleStartRoom = async (pack) => {
        const code = generateRoomCode();

        // Initialize question states map
        const qStates = {};
        pack.categories.forEach(cat => {
            cat.questions.forEach(q => {
                qStates[q.id] = 'available';
            });
        });

        const hostAvatar = ANIMAL_AVATARS[Math.floor(Math.random() * ANIMAL_AVATARS.length)];

        const roomData = {
            hostId: user.uid,
            status: 'lobby',
            pack: pack,
            players: {
                [user.uid]: { name: hostName, score: 0, isHost: true, avatar: hostAvatar }
            },
            questionStates: qStates,
            currentTurn: null,
            activeQuestionId: null,
            answerRevealed: false,
            buzzedPlayerId: null,
            buzzTimestamp: null,
            incorrectBuzzedIds: [],
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
            ) : packs.length === 0 ? (
                <div className="text-center p-12 border-2 border-dashed border-slate-700 rounded-xl">
                    <p className="text-slate-400 mb-4">{t('noPublicPacks')}</p>
                    <button
                        onClick={onCreatePack}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold"
                    >
                        {t('createOneNow')}
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {packs.map(pack => (
                        <div key={pack.id} className="bg-slate-800 border border-slate-600 p-5 rounded-xl hover:border-purple-500 transition-colors flex flex-col">
                            <h4 className="font-bold text-lg mb-1">{pack.name}</h4>
                            <p className="text-sm text-slate-400 mb-2">
                                {t('packStats', {
                                    categories: pack.categories?.length || 0,
                                    questions: pack.categories?.reduce((acc, c) => acc + (c.questions?.length || 0), 0)
                                })}
                            </p>
                            <p className="text-xs text-slate-500 mb-4">
                                {t('byAuthor', { author: pack.ownerEmail || t('unknownAuthor') })}
                            </p>
                            <button
                                onClick={() => handleStartRoom(pack)}
                                className="mt-auto bg-purple-600 hover:bg-purple-500 w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2"
                            >
                                <Play size={18} /> {t('startRoom')}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
