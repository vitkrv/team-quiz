import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Check, Eye, PartyPopper, Plus, Trash2, X } from 'lucide-react';
import PackMediaAttachment from '../components/PackMediaAttachment';
import { appId, db } from '../firebase';
import { deleteMedia, MEDIA_SLOTS, uploadMedia, getMediaKind } from '../services/imageStorage';
import { useLanguage } from '../useLanguage';
import { generateId } from '../utils/ids';
import { getFirestoreErrorMessage } from '../utils/errors';

const SURPRISE_DEFAULT_MIN_POINTS = 100;
const SURPRISE_DEFAULT_MAX_POINTS = 500;
const POINT_STEP = 100;

const normalizePoints = (value, fallback = POINT_STEP) => {
    const parsedValue = Number.parseInt(value, 10);
    if (Number.isNaN(parsedValue)) return fallback;

    return Math.max(POINT_STEP, Math.round(parsedValue / POINT_STEP) * POINT_STEP);
};

const getSurpriseMinPoints = (question) => normalizePoints(question.surpriseMinPoints, SURPRISE_DEFAULT_MIN_POINTS);
const getSurpriseMaxPoints = (question) => Math.max(
    getSurpriseMinPoints(question),
    normalizePoints(question.surpriseMaxPoints ?? question.points, SURPRISE_DEFAULT_MAX_POINTS)
);
const getSurpriseDisplayPoints = (question) => normalizePoints(
    question.surpriseDisplayPoints,
    getSurpriseMaxPoints(question)
);
const getQuestionPointsForSummary = (question) => (
    question.isSurpriseQuestion ? getSurpriseMaxPoints(question) : (Number(question.points) || 0)
);

const createEmptyQuestion = (points = 100) => ({ id: generateId(), points, text: '', answer: '' });

const createDefaultCategories = (t) => [
    { id: generateId(), name: t('defaultCategory'), questions: [
            createEmptyQuestion(100),
            createEmptyQuestion(200)
        ]}
];

const cleanMediaForSave = (media) => {
    if (!media) return null;
    const savedMedia = { ...media };
    delete savedMedia.previewUrl;
    delete savedMedia.pendingFile;
    delete savedMedia.previousMedia;
    return savedMedia;
};

const stripPendingCategories = (categories) => categories.map((category) => ({
    ...category,
    questions: category.questions.map((question) => {
        const isSurpriseQuestion = Boolean(question.isSurpriseQuestion);
        const surpriseMinPoints = getSurpriseMinPoints(question);
        const surpriseMaxPoints = getSurpriseMaxPoints(question);
        const nextQuestion = {
            id: question.id,
            points: isSurpriseQuestion ? surpriseMaxPoints : normalizePoints(question.points),
            text: question.text,
            answer: question.answer
        };

        if (isSurpriseQuestion) {
            nextQuestion.isSurpriseQuestion = true;
            nextQuestion.surpriseMinPoints = surpriseMinPoints;
            nextQuestion.surpriseMaxPoints = surpriseMaxPoints;
            nextQuestion.surpriseDisplayPoints = getSurpriseDisplayPoints(question);
        }

        const questionMedia = cleanMediaForSave(question.questionMedia);
        const answerMedia = cleanMediaForSave(question.answerMedia);

        if (questionMedia) {
            nextQuestion.questionMedia = questionMedia;
        } else {
            delete nextQuestion.questionMedia;
        }

        if (answerMedia) {
            nextQuestion.answerMedia = answerMedia;
        } else {
            delete nextQuestion.answerMedia;
        }

        return nextQuestion;
    })
}));

const hasEffectiveMedia = (question, field) => Boolean(question[field]);

const getSavedMediaFromQuestion = (question) => (
    [question.questionMedia, question.answerMedia]
        .map((media) => media?.previousMedia || media)
        .filter((media) => media?.fileId)
);

const setQuestionMediaInCategories = (categories, catId, qId, field, media) => categories.map((category) => {
    if (category.id !== catId) return category;

    return {
        ...category,
        questions: category.questions.map((question) => {
            if (question.id !== qId) return question;
            const nextQuestion = { ...question };
            if (media) {
                nextQuestion[field] = media;
            } else {
                delete nextQuestion[field];
            }
            return nextQuestion;
        })
    };
});

const getPackSummary = (categories) => {
    const sectionCount = categories.length;
    const questionCount = categories.reduce((total, category) => total + (category.questions?.length || 0), 0);
    const surpriseQuestionCount = categories.reduce((total, category) => (
        total + (category.questions || []).filter((question) => question.isSurpriseQuestion).length
    ), 0);
    const mediaCount = categories.reduce((total, category) => (
        total + (category.questions || []).reduce((questionTotal, question) => (
            questionTotal + (question.questionMedia ? 1 : 0) + (question.answerMedia ? 1 : 0)
        ), 0)
    ), 0);
    const totalPoints = categories.reduce((total, category) => (
        total + (category.questions || []).reduce((questionTotal, question) => questionTotal + getQuestionPointsForSummary(question), 0)
    ), 0);
    const averageQuestionsPerCategory = sectionCount > 0 ? questionCount / sectionCount : 0;

    return {
        sectionCount,
        questionCount,
        surpriseQuestionCount,
        mediaCount,
        totalPoints,
        averageQuestionsPerCategory
    };
};

const isPreviewReadyQuestion = (question) => (
    (question.text?.trim() || hasEffectiveMedia(question, MEDIA_SLOTS.QUESTION))
    && (question.answer?.trim() || hasEffectiveMedia(question, MEDIA_SLOTS.ANSWER))
);

const getPreviewCategories = (categories) => categories
    .map((category) => ({
        ...category,
        questions: (category.questions || [])
            .filter(isPreviewReadyQuestion)
            .map((question) => ({
                ...question,
                points: question.isSurpriseQuestion ? getSurpriseDisplayPoints(question) : normalizePoints(question.points)
            }))
    }))
    .filter((category) => category.questions.length > 0);

function PreviewBoardGrid({ categories }) {
    return (
        <div
            className="grid min-h-[28rem] min-w-[44rem] flex-1 gap-4"
            style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(8rem, 1fr))` }}
        >
            {categories.map((cat, i) => (
                <div key={cat.id || i} className="flex min-h-0 flex-col gap-4">
                    <div className="flex min-h-[4rem] items-center justify-center rounded-lg border-2 border-blue-500 bg-blue-900 p-3 text-center shadow-md shadow-black/50">
                        <span className="break-words text-sm font-bold uppercase leading-tight tracking-wide text-blue-100 drop-shadow-md md:text-base">
                            {cat.name}
                        </span>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col gap-4">
                        {cat.questions.map((q) => (
                            <div
                                key={q.id}
                                className="flex min-h-20 flex-1 cursor-default items-center justify-center rounded-lg bg-blue-800 font-mono text-2xl font-black text-yellow-400 shadow-[inset_0_-4px_0_0_rgba(0,0,0,0.3)] shadow-black md:text-4xl"
                            >
                                {q.points}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function QuestionPackPreviewModal({ categories, onClose, t }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6">
            <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 p-5">
                    <h2 className="min-w-0 pr-4 text-xl font-bold text-white">{t('questionPackPreview')}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('closeQuestionPackPreview')}
                        title={t('closeQuestionPackPreview')}
                        className="shrink-0 text-slate-500 hover:text-white"
                    >
                        <X size={22} />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-950 to-slate-900 p-5">
                    {categories.length === 0 ? (
                        <div className="flex min-h-[18rem] items-center justify-center rounded-lg border border-dashed border-slate-700 p-8 text-center text-slate-400">
                            {t('noPreviewQuestions')}
                        </div>
                    ) : (
                        <PreviewBoardGrid categories={categories} />
                    )}
                </div>
            </div>
        </div>
    );
}

export default function PackCreator({ pack, setView, user, setError, onSaved }) {
    const { language, t } = useLanguage();
    const isEditMode = Boolean(pack?.id);
    const [persistedPackId, setPersistedPackId] = useState(pack?.id || null);
    const [packName, setPackName] = useState(pack?.name || '');
    const [categories, setCategories] = useState(pack?.categories || createDefaultCategories(t));
    const [isSaving, setIsSaving] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [mediaProgress, setMediaProgress] = useState({});
    const [mediaErrors, setMediaErrors] = useState({});
    const categoriesRef = useRef(categories);

    categoriesRef.current = categories;
    const hasActiveMediaAction = Object.values(mediaProgress).some((value) => value > 0 && value < 100);
    const packSummary = getPackSummary(categories);
    const previewCategories = getPreviewCategories(categories);

    useEffect(() => () => {
        categoriesRef.current.forEach((category) => {
            category.questions.forEach((question) => {
                [question.questionMedia, question.answerMedia].forEach((media) => {
                    if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
                });
            });
        });
    }, []);

    const handleBack = () => {
        setView(isEditMode ? 'managePacks' : 'menu');
    };

    const addCategory = () => {
        setCategories([...categories, { id: generateId(), name: t('newCategory'), questions: [createEmptyQuestion(100)] }]);
    };

    const getPackRef = (packId) => doc(db, 'artifacts', appId, 'public', 'data', 'packs', packId);

    const getPackData = (sourceCategories, timestamp = Date.now()) => ({
        name: packName.trim() || t('untitledPack'),
        ownerId: user.uid,
        ownerEmail: user.email || null,
        updatedAt: timestamp,
        categories: stripPendingCategories(sourceCategories)
    });

    const ensurePackForMediaAction = async (sourceCategories = categories) => {
        if (persistedPackId) {
            const timestamp = Date.now();
            await updateDoc(getPackRef(persistedPackId), getPackData(sourceCategories, timestamp));
            return persistedPackId;
        }

        const packsRef = collection(db, 'artifacts', appId, 'public', 'data', 'packs');
        const newPackRef = doc(packsRef);
        const timestamp = Date.now();
        await setDoc(newPackRef, {
            ...getPackData(sourceCategories, timestamp),
            createdAt: timestamp
        });
        setPersistedPackId(newPackRef.id);
        return newPackRef.id;
    };

    const deleteMediaNow = async (mediaItems) => {
        const savedMedia = mediaItems.filter((media) => media?.fileId);
        if (savedMedia.length === 0) return;
        await Promise.all(savedMedia.map((media) => deleteMedia(media)));
    };

    const persistCategoriesIfNeeded = async (nextCategories) => {
        if (!persistedPackId) return;
        await updateDoc(getPackRef(persistedPackId), {
            categories: stripPendingCategories(nextCategories),
            updatedAt: Date.now()
        });
    };

    const removeCategory = async (catId) => {
        const category = categories.find((item) => item.id === catId);
        const nextCategories = categories.filter(c => c.id !== catId);
        setCategories(nextCategories);
        try {
            await persistCategoriesIfNeeded(nextCategories);
            await deleteMediaNow((category?.questions || []).flatMap(getSavedMediaFromQuestion));
        } catch (err) {
            console.error("Media delete error:", err);
            setError(err.messageKey ? t(err.messageKey) : err.message);
        }
    };

    const updateCategoryName = (catId, name) => {
        setCategories(categories.map(c => c.id === catId ? { ...c, name } : c));
    };

    const addQuestion = (catId) => {
        setCategories(categories.map(c => {
            if (c.id === catId) {
                const lastPoints = c.questions.length > 0 ? normalizePoints(c.questions[c.questions.length - 1].points, 0) : 0;
                return { ...c, questions: [...c.questions, createEmptyQuestion(lastPoints + 100)] };
            }
            return c;
        }));
    };

    const updateQuestion = (catId, qId, field, value) => {
        setCategories(categories.map(c => {
            if (c.id === catId) {
                return {
                    ...c,
                    questions: c.questions.map(q => {
                        if (q.id !== qId) return q;

                        if (field === 'isSurpriseQuestion') {
                            const isSurpriseQuestion = Boolean(value);
                            const surpriseMinPoints = getSurpriseMinPoints(q);
                            const surpriseMaxPoints = q.surpriseMaxPoints === undefined
                                ? SURPRISE_DEFAULT_MAX_POINTS
                                : getSurpriseMaxPoints(q);

                            return {
                                ...q,
                                isSurpriseQuestion,
                                surpriseMinPoints,
                                surpriseMaxPoints,
                                surpriseDisplayPoints: isSurpriseQuestion
                                    ? getSurpriseDisplayPoints({ ...q, surpriseMaxPoints })
                                    : q.surpriseDisplayPoints,
                                points: isSurpriseQuestion ? surpriseMaxPoints : normalizePoints(q.points ?? surpriseMaxPoints)
                            };
                        }

                        if (field === 'points') {
                            return { ...q, points: value };
                        }

                        if (field === 'surpriseMinPoints') {
                            return { ...q, surpriseMinPoints: value };
                        }

                        if (field === 'surpriseMaxPoints') {
                            return { ...q, surpriseMaxPoints: value, points: value };
                        }

                        if (field === 'surpriseDisplayPoints') {
                            return { ...q, surpriseDisplayPoints: value };
                        }

                        return { ...q, [field]: value };
                    })
                };
            }
            return c;
        }));
    };

    const validateQuestionPoints = (catId, qId, field) => {
        setCategories(categories.map(c => {
            if (c.id !== catId) return c;

            return {
                ...c,
                questions: c.questions.map(q => {
                    if (q.id !== qId) return q;

                    if (field === 'points') {
                        return { ...q, points: normalizePoints(q.points) };
                    }

                    if (field === 'surpriseMinPoints') {
                        const surpriseMinPoints = normalizePoints(q.surpriseMinPoints, SURPRISE_DEFAULT_MIN_POINTS);
                        const surpriseMaxPoints = Math.max(
                            surpriseMinPoints,
                            normalizePoints(q.surpriseMaxPoints ?? q.points, SURPRISE_DEFAULT_MAX_POINTS)
                        );

                        return { ...q, surpriseMinPoints, surpriseMaxPoints, points: surpriseMaxPoints };
                    }

                    if (field === 'surpriseMaxPoints') {
                        const surpriseMinPoints = normalizePoints(q.surpriseMinPoints, SURPRISE_DEFAULT_MIN_POINTS);
                        const surpriseMaxPoints = Math.max(
                            surpriseMinPoints,
                            normalizePoints(q.surpriseMaxPoints ?? q.points, SURPRISE_DEFAULT_MAX_POINTS)
                        );

                        return { ...q, surpriseMinPoints, surpriseMaxPoints, points: surpriseMaxPoints };
                    }

                    if (field === 'surpriseDisplayPoints') {
                        return { ...q, surpriseDisplayPoints: getSurpriseDisplayPoints(q) };
                    }

                    return q;
                })
            };
        }));
    };

    const removeQuestion = async (catId, qId) => {
        const category = categories.find((item) => item.id === catId);
        const question = category?.questions.find((item) => item.id === qId);
        const nextCategories = categories.map(c => {
            if (c.id === catId) {
                return { ...c, questions: c.questions.filter(q => q.id !== qId) };
            }
            return c;
        });
        setCategories(nextCategories);
        try {
            await persistCategoriesIfNeeded(nextCategories);
            await deleteMediaNow(getSavedMediaFromQuestion(question || {}));
        } catch (err) {
            console.error("Media delete error:", err);
            setError(err.messageKey ? t(err.messageKey) : err.message);
        }
    };

    const updateQuestionMedia = async (catId, qId, field, file) => {
        const previewUrl = URL.createObjectURL(file);
        const progressKey = `${qId}:${field}`;
        const previousQuestion = categories
            .find((category) => category.id === catId)
            ?.questions.find((question) => question.id === qId);
        const previousMedia = previousQuestion?.[field];
        const previewMedia = {
            provider: 'imagekit',
            kind: getMediaKind(file),
            pendingFile: file,
            previewUrl,
            name: file.name,
            size: file.size,
            mimeType: file.type,
            previousMedia
        };
        const previewCategories = setQuestionMediaInCategories(categories, catId, qId, field, previewMedia);

        setMediaErrors((errors) => ({ ...errors, [`${qId}:${field}`]: '' }));
        setMediaProgress((progress) => ({ ...progress, [progressKey]: 1 }));
        setCategories(previewCategories);

        try {
            const packId = await ensurePackForMediaAction(stripPendingCategories(categories));
            const uploadedMedia = await uploadMedia(file, {
                packId,
                questionId: qId,
                slot: field,
                onProgress: (value) => setMediaProgress((progress) => ({ ...progress, [progressKey]: value }))
            });
            const nextCategories = setQuestionMediaInCategories(categoriesRef.current, catId, qId, field, uploadedMedia);
            setCategories(nextCategories);
            await updateDoc(getPackRef(packId), {
                categories: stripPendingCategories(nextCategories),
                updatedAt: Date.now()
            });
            if (previousMedia?.fileId) {
                await deleteMedia(previousMedia);
            }
            setMediaProgress((progress) => ({ ...progress, [progressKey]: 100 }));
        } catch (err) {
            console.error("Media upload error:", err);
            const restoredCategories = setQuestionMediaInCategories(categoriesRef.current, catId, qId, field, previousMedia);
            setCategories(restoredCategories);
            setMediaProgress((progress) => ({ ...progress, [progressKey]: 0 }));
            setMediaErrors((errors) => ({ ...errors, [progressKey]: err.messageKey ? t(err.messageKey) : err.message }));
            setError(err.messageKey ? t(err.messageKey) : err.message);
        } finally {
            URL.revokeObjectURL(previewUrl);
        }
    };

    const removeQuestionMedia = async (catId, qId, field) => {
        const progressKey = `${qId}:${field}`;
        const previousQuestion = categories
            .find((category) => category.id === catId)
            ?.questions.find((question) => question.id === qId);
        const previousMedia = previousQuestion?.[field];
        const nextCategories = setQuestionMediaInCategories(categories, catId, qId, field, null);

        setMediaErrors((errors) => ({ ...errors, [progressKey]: '' }));
        setCategories(nextCategories);

        try {
            if (persistedPackId) {
                await updateDoc(getPackRef(persistedPackId), {
                    categories: stripPendingCategories(nextCategories),
                    updatedAt: Date.now()
                });
            }
            if (previousMedia?.fileId) {
                await deleteMedia(previousMedia);
            }
        } catch (err) {
            console.error("Media delete error:", err);
            setCategories(setQuestionMediaInCategories(categoriesRef.current, catId, qId, field, previousMedia));
            setMediaErrors((errors) => ({ ...errors, [progressKey]: err.messageKey ? t(err.messageKey) : err.message }));
            setError(err.messageKey ? t(err.messageKey) : err.message);
        }
    };

    const validateQuestions = () => {
        for (const category of categories) {
            for (const question of category.questions) {
                if (!question.text.trim() && !hasEffectiveMedia(question, MEDIA_SLOTS.QUESTION)) {
                    alert(t('questionTextOrMediaRequired'));
                    return false;
                }

                if (!question.answer.trim() && !hasEffectiveMedia(question, MEDIA_SLOTS.ANSWER)) {
                    alert(t('answerTextOrMediaRequired'));
                    return false;
                }
            }
        }

        return true;
    };

    const handleSave = async () => {
        if (!packName.trim()) return alert(t('pleaseEnterPackName'));
        if (hasActiveMediaAction) return alert(t('mediaActionInProgress'));
        if (!validateQuestions()) return;

        setIsSaving(true);
        setMediaErrors({});

        try {
            const finalCategories = stripPendingCategories(categories);

            const packData = {
                name: packName,
                ownerId: user.uid,
                ownerEmail: user.email || null,
                updatedAt: Date.now(),
                categories: finalCategories
            };

            if (persistedPackId) {
                await updateDoc(getPackRef(persistedPackId), packData);
            } else {
                const packsRef = collection(db, 'artifacts', appId, 'public', 'data', 'packs');
                const createdDoc = await addDoc(packsRef, {
                    ...packData,
                    createdAt: Date.now()
                });
                setPersistedPackId(createdDoc.id);
            }

            onSaved();
        } catch (err) {
            console.error("Save error:", err);
            setError(getFirestoreErrorMessage(err, isEditMode ? t('updatePackAction') : t('savePackAction'), language));
        }
        setIsSaving(false);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen flex flex-col">
            {isPreviewOpen && (
                <QuestionPackPreviewModal
                    categories={previewCategories}
                    t={t}
                    onClose={() => setIsPreviewOpen(false)}
                />
            )}
            <div className="flex items-center mb-8">
                <button onClick={handleBack} className="p-2 mr-4 hover:bg-slate-800 rounded-full transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-3xl font-bold flex-1">{isEditMode ? t('editQuestionPack') : t('createQuestionPack')}</h2>
                <button
                    onClick={handleSave}
                    disabled={isSaving || hasActiveMediaAction}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"
                >
                    <Check size={20} /> {isSaving ? t('saving') : isEditMode ? t('updatePack') : t('savePack')}
                </button>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-8">
                <label className="block text-sm font-medium text-slate-400 mb-2">{t('packName')}</label>
                <input
                    type="text"
                    value={packName}
                    onChange={(e) => setPackName(e.target.value)}
                    placeholder={t('packNamePlaceholder')}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
            </div>

            <div className="mb-8 rounded-xl border border-slate-700 bg-slate-800/50 p-5">
                <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-400">{t('packSummary')}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryQuestions')}</div>
                        <div className="pt-3 text-2xl font-black text-white">{packSummary.questionCount}</div>
                    </div>
                    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summarySurpriseQuestions')}</div>
                        <div className="pt-3 text-2xl font-black text-yellow-300">{packSummary.surpriseQuestionCount}</div>
                    </div>
                    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryCategories')}</div>
                        <div className="pt-3 text-2xl font-black text-white">{packSummary.sectionCount}</div>
                    </div>
                    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryMedia')}</div>
                        <div className="pt-3 text-2xl font-black text-white">{packSummary.mediaCount}</div>
                    </div>
                    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryTotalPoints')}</div>
                        <div className="pt-3 text-2xl font-black text-yellow-400">{packSummary.totalPoints}</div>
                    </div>
                    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryAvgQuestions')}</div>
                        <div className="pt-3 text-2xl font-black text-white">{packSummary.averageQuestionsPerCategory.toFixed(1)}</div>
                    </div>
                </div>
            </div>

            <div className="mb-8 rounded-xl border border-slate-700 bg-slate-800/50 p-5">
                <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-400">{t('additionalSettings')}</h3>
                <button
                    type="button"
                    onClick={() => setIsPreviewOpen(true)}
                    className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-lg border border-blue-500/40 bg-blue-600/20 px-4 py-3 text-left font-bold text-blue-100 transition-colors hover:border-blue-400 hover:bg-blue-600/30"
                >
                    <Eye size={18} className="shrink-0" /> {t('showQuestionPackPreview')}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 pb-12">
                {categories.map((cat, catIdx) => (
                    <div key={cat.id} className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-slate-500 mb-1">{t('categoryNumber', { number: catIdx + 1 })}</label>
                                <input
                                    type="text"
                                    value={cat.name}
                                    onChange={(e) => updateCategoryName(cat.id, e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-white font-bold outline-none"
                                />
                            </div>
                            <button onClick={() => removeCategory(cat.id)} className="mt-5 p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                                <Trash2 size={20} />
                            </button>
                        </div>

                        <div className="space-y-4 pl-4 border-l-2 border-slate-700">
                            {cat.questions.map((q) => (
                                <div key={q.id} className={`flex gap-4 rounded-lg border p-4 ${q.isSurpriseQuestion ? 'border-yellow-400 bg-yellow-950/20' : 'border-transparent bg-slate-900'}`}>
                                    <div className="w-32 shrink-0 space-y-3">
                                        <label className="flex items-center gap-2 text-xs font-bold text-yellow-300">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(q.isSurpriseQuestion)}
                                                onChange={(e) => updateQuestion(cat.id, q.id, 'isSurpriseQuestion', e.target.checked)}
                                                className="h-4 w-4 accent-yellow-400"
                                            />
                                            <PartyPopper size={14} /> {t('surpriseQuestion')}
                                        </label>
                                        {q.isSurpriseQuestion ? (
                                            <div className="space-y-2">
                                                <label className="block">
                                                    <span className="mb-1 block text-xs text-slate-500">{t('pointsFrom')}</span>
                                                    <input
                                                        type="number"
                                                        min={POINT_STEP}
                                                        step={POINT_STEP}
                                                        value={q.surpriseMinPoints ?? SURPRISE_DEFAULT_MIN_POINTS}
                                                        onChange={(e) => updateQuestion(cat.id, q.id, 'surpriseMinPoints', e.target.value)}
                                                        onBlur={() => validateQuestionPoints(cat.id, q.id, 'surpriseMinPoints')}
                                                        className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-center font-mono text-yellow-400 outline-none"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="mb-1 block text-xs text-slate-500">{t('pointsTo')}</span>
                                                    <input
                                                        type="number"
                                                        min={getSurpriseMinPoints(q)}
                                                        step={POINT_STEP}
                                                        value={q.surpriseMaxPoints ?? getSurpriseMaxPoints(q)}
                                                        onChange={(e) => updateQuestion(cat.id, q.id, 'surpriseMaxPoints', e.target.value)}
                                                        onBlur={() => validateQuestionPoints(cat.id, q.id, 'surpriseMaxPoints')}
                                                        className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-center font-mono text-yellow-400 outline-none"
                                                    />
                                                </label>
                                                <div className="border-t border-slate-700/80 pt-2">
                                                    <label className="block">
                                                        <span className="mb-1 block text-xs text-slate-500">{t('shownAs')}</span>
                                                        <input
                                                            type="number"
                                                            min={POINT_STEP}
                                                            step={POINT_STEP}
                                                            value={q.surpriseDisplayPoints ?? getSurpriseDisplayPoints(q)}
                                                            onChange={(e) => updateQuestion(cat.id, q.id, 'surpriseDisplayPoints', e.target.value)}
                                                            onBlur={() => validateQuestionPoints(cat.id, q.id, 'surpriseDisplayPoints')}
                                                            className="w-full rounded border border-slate-700 bg-slate-800 p-2 text-center font-mono text-yellow-400 outline-none"
                                                        />
                                                    </label>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">{t('points')}</label>
                                                <input
                                                    type="number"
                                                    min={POINT_STEP}
                                                    step={POINT_STEP}
                                                    value={q.points}
                                                    onChange={(e) => updateQuestion(cat.id, q.id, 'points', e.target.value)}
                                                    onBlur={() => validateQuestionPoints(cat.id, q.id, 'points')}
                                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-yellow-400 font-mono text-center outline-none"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">{t('question')}</label>
                                            <textarea
                                                value={q.text}
                                                onChange={(e) => updateQuestion(cat.id, q.id, 'text', e.target.value)}
                                                placeholder={t('questionPlaceholder')}
                                                rows={3}
                                                className="w-full resize-y bg-slate-800 border border-slate-700 rounded p-2 text-white outline-none"
                                            />
                                            <PackMediaAttachment
                                                media={q.questionMedia}
                                                label={t('questionMediaAlt')}
                                                disabled={isSaving || Boolean(mediaProgress[`${q.id}:${MEDIA_SLOTS.QUESTION}`] > 0 && mediaProgress[`${q.id}:${MEDIA_SLOTS.QUESTION}`] < 100)}
                                                progress={mediaProgress[`${q.id}:${MEDIA_SLOTS.QUESTION}`] || 0}
                                                error={mediaErrors[`${q.id}:${MEDIA_SLOTS.QUESTION}`]}
                                                t={t}
                                                onChange={(file) => updateQuestionMedia(cat.id, q.id, MEDIA_SLOTS.QUESTION, file)}
                                                onRemove={() => removeQuestionMedia(cat.id, q.id, MEDIA_SLOTS.QUESTION)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">{t('answer')}</label>
                                            <input
                                                type="text"
                                                value={q.answer}
                                                onChange={(e) => updateQuestion(cat.id, q.id, 'answer', e.target.value)}
                                                placeholder={t('answerPlaceholder')}
                                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-green-400 outline-none"
                                            />
                                            <PackMediaAttachment
                                                media={q.answerMedia}
                                                label={t('answerMediaAlt')}
                                                disabled={isSaving || Boolean(mediaProgress[`${q.id}:${MEDIA_SLOTS.ANSWER}`] > 0 && mediaProgress[`${q.id}:${MEDIA_SLOTS.ANSWER}`] < 100)}
                                                progress={mediaProgress[`${q.id}:${MEDIA_SLOTS.ANSWER}`] || 0}
                                                error={mediaErrors[`${q.id}:${MEDIA_SLOTS.ANSWER}`]}
                                                t={t}
                                                onChange={(file) => updateQuestionMedia(cat.id, q.id, MEDIA_SLOTS.ANSWER, file)}
                                                onRemove={() => removeQuestionMedia(cat.id, q.id, MEDIA_SLOTS.ANSWER)}
                                            />
                                        </div>
                                    </div>
                                    <button onClick={() => removeQuestion(cat.id, q.id)} className="text-slate-600 hover:text-red-400 transition-colors self-start mt-6">
                                        <X size={20} />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => addQuestion(cat.id)}
                                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 py-2"
                            >
                                <Plus size={16} /> {t('addQuestion')}
                            </button>
                        </div>
                    </div>
                ))}

                <button
                    onClick={addCategory}
                    className="w-full border-2 border-dashed border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-300 p-6 rounded-xl flex items-center justify-center gap-2 font-bold transition-colors"
                >
                    <Plus size={24} /> {t('addCategory')}
                </button>
            </div>
        </div>
    );
}
