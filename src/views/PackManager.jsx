import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Edit3, Plus, Trash2 } from 'lucide-react';
import { appId, db } from '../firebase';
import { deleteMedia } from '../services/imageStorage';
import { useLanguage } from '../useLanguage';
import { getFirestoreErrorMessage } from '../utils/errors';

const getPackMedia = (pack) => (
    (pack.categories || []).flatMap((category) => (
        (category.questions || []).flatMap((question) => (
            [question.questionMedia, question.answerMedia].filter((media) => media?.fileId)
        ))
    ))
);

export default function PackManager({ setView, user, setError, onCreatePack, onEditPack }) {
    const { language, t } = useLanguage();
    const [packs, setPacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deletingPackId, setDeletingPackId] = useState(null);

    useEffect(() => {
        const fetchPacks = async () => {
            try {
                const packsRef = collection(db, 'artifacts', appId, 'public', 'data', 'packs');
                const snapshot = await getDocs(query(packsRef, where('ownerId', '==', user.uid)));
                const loadedPacks = [];
                snapshot.forEach((packDoc) => loadedPacks.push({ id: packDoc.id, ...packDoc.data() }));
                setPacks(loadedPacks.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
            } catch (err) {
                console.error("Error fetching owned packs", err);
                setError(getFirestoreErrorMessage(err, t('loadPacksAction'), language));
            }
            setLoading(false);
        };

        fetchPacks();
    }, [language, setError, t, user.uid]);

    const handleDeletePack = async (pack) => {
        const firstConfirmed = window.confirm(t('deletePackConfirm', { packName: pack.name }));
        if (!firstConfirmed) return;

        const secondConfirmed = window.confirm(t('deletePackFinalConfirm', { packName: pack.name }));
        if (!secondConfirmed) return;

        setDeletingPackId(pack.id);
        try {
            const packMedia = getPackMedia(pack);
            await Promise.all(packMedia.map((media) => deleteMedia(media)));
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'packs', pack.id));
            setPacks(packs.filter((item) => item.id !== pack.id));
        } catch (err) {
            console.error("Delete pack error:", err);
            setError(err.messageKey ? t(err.messageKey) : getFirestoreErrorMessage(err, t('deletePackAction'), language));
        }
        setDeletingPackId(null);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen">
            <div className="flex items-center mb-8">
                <button onClick={() => setView('menu')} className="p-2 mr-4 hover:bg-slate-800 rounded-full transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-3xl font-bold flex-1">{t('myQuestionPacks')}</h2>
                <button
                    onClick={onCreatePack}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-bold flex items-center gap-2"
                >
                    <Plus size={18} /> {t('newPack')}
                </button>
            </div>

            {loading ? (
                <div className="text-center p-8 text-slate-500 animate-pulse">{t('loadingPacks')}</div>
            ) : packs.length === 0 ? (
                <div className="text-center p-12 border-2 border-dashed border-slate-700 rounded-xl">
                    <p className="text-slate-400 mb-4">{t('noOwnedPacks')}</p>
                    <button
                        onClick={onCreatePack}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold"
                    >
                        {t('createOneNow')}
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {packs.map((pack) => (
                        <div key={pack.id} className="bg-slate-800 border border-slate-600 p-5 rounded-xl flex flex-col">
                            <h4 className="font-bold text-lg mb-1">{pack.name}</h4>
                            <p className="text-sm text-slate-400 mb-2">
                                {t('packStats', {
                                    categories: pack.categories?.length || 0,
                                    questions: pack.categories?.reduce((acc, c) => acc + (c.questions?.length || 0), 0)
                                })}
                            </p>
                            <p className="text-xs text-slate-500 mb-5">
                                {t('publicPackOwnerOnly')}
                            </p>
                            <div className="mt-auto flex gap-2">
                                <button
                                    onClick={() => onEditPack(pack)}
                                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2"
                                >
                                    <Edit3 size={18} /> {t('edit')}
                                </button>
                                <button
                                    onClick={() => handleDeletePack(pack)}
                                    disabled={deletingPackId === pack.id}
                                    className="bg-red-600/20 text-red-300 hover:bg-red-600 hover:text-white disabled:opacity-50 px-4 py-2 rounded-lg font-bold border border-red-500/30 transition-colors"
                                    title={t('deletePackTitle')}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
