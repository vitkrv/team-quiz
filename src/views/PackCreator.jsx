import { getPackRounds, getRoundPointStep, validatePackRounds, MAX_PACK_ROUNDS } from '../utils/packRounds';
import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, deleteField, setDoc, updateDoc } from 'firebase/firestore';
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronRight, Eye, Lock, PartyPopper, Plus, Trash2, X } from 'lucide-react';
import EmojiPicker from '../components/EmojiPicker';
import QuestionPresenter from '../components/QuestionPresenter';
import PackMediaAttachment from '../components/PackMediaAttachment';
import MediaPasteDialog from '../components/MediaPasteDialog';
import DeleteRoundDialog from '../components/DeleteRoundDialog';
import HoldToConfirmButton from '../components/HoldToConfirmButton';
import { normalizeSurpriseScoringMechanic, SURPRISE_SCORING_MECHANICS } from '../constants';
import { appId, db } from '../firebase';
import { deleteMedia, MEDIA_KINDS, MEDIA_SLOTS, PACK_PRIZE_MEDIA_ID, uploadMedia, getMediaKind, validateMediaFile } from '../services/imageStorage';
import { getPackAnalyticsSummary, trackEvent } from '../services/analytics';
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

const createDefaultCategories = (t, pointStep = POINT_STEP) => [
    { id: generateId(), name: t('defaultCategory'), questions: [
            createEmptyQuestion(pointStep),
            createEmptyQuestion(pointStep * 2)
        ]}
];

const ensureEditableCategoryIds = (sourceCategories, t) => {
    const categories = sourceCategories || createDefaultCategories(t);
    const categoryIds = new Set();
    const questionIds = new Set();

    return categories.map((category) => {
        const categoryId = category.id && !categoryIds.has(category.id) ? category.id : generateId();
        categoryIds.add(categoryId);

        return {
            ...category,
            id: categoryId,
            questions: (category.questions || []).map((question) => {
                const questionId = question.id && !questionIds.has(question.id) ? question.id : generateId();
                questionIds.add(questionId);

                return { ...question, id: questionId };
            })
        };
    });
};

const reorderItem = (items, fromIndex, toIndex) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
        return items;
    }

    const nextItems = [...items];
    const [movedItem] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, movedItem);
    return nextItems;
};

const preventTextSelection = (event) => {
    event.preventDefault();
};

const cleanMediaForSave = (media) => {
    if (!media) return null;
    const savedMedia = { ...media };
    delete savedMedia.previewUrl;
    delete savedMedia.pendingFile;
    delete savedMedia.previousMedia;
    return savedMedia;
};

const cleanPrizeForSave = (prize) => {
    const hiddenMedia = cleanMediaForSave(prize?.hiddenMedia);
    const revealedMedia = cleanMediaForSave(prize?.revealedMedia);
    if (!hiddenMedia && !revealedMedia) return null;

    return {
        ...(hiddenMedia ? { hiddenMedia } : {}),
        ...(revealedMedia ? { revealedMedia } : {})
    };
};

const normalizeQuestionText = (text = '') => text.replace(/\r\n?/g, '\n');

const stripPendingCategories = (categories) => categories.map((category) => ({
    ...category,
    questions: category.questions.map((question) => {
        const isSurpriseQuestion = Boolean(question.isSurpriseQuestion);
        const surpriseMinPoints = getSurpriseMinPoints(question);
        const surpriseMaxPoints = getSurpriseMaxPoints(question);
        const nextQuestion = {
            id: question.id,
            points: isSurpriseQuestion ? surpriseMaxPoints : normalizePoints(question.points),
            text: normalizeQuestionText(question.text),
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

const getPrizeMediaField = (slot) => (
    slot === MEDIA_SLOTS.PRIZE_HIDDEN ? 'hiddenMedia' : 'revealedMedia'
);

const setPrizeMedia = (prize, slot, media) => {
    const field = getPrizeMediaField(slot);
    const nextPrize = { ...(prize || {}) };

    if (media) {
        nextPrize[field] = media;
    } else {
        delete nextPrize[field];
    }

    return nextPrize;
};

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

const getPackSummary = (categories, prize) => {
    const sectionCount = categories.length;
    const questionCount = categories.reduce((total, category) => total + (category.questions?.length || 0), 0);
    const surpriseQuestionCount = categories.reduce((total, category) => (
        total + (category.questions || []).filter((question) => question.isSurpriseQuestion).length
    ), 0);
    const mediaCount = categories.reduce((total, category) => (
        total + (category.questions || []).reduce((questionTotal, question) => (
            questionTotal + (question.questionMedia ? 1 : 0) + (question.answerMedia ? 1 : 0)
        ), 0)
    ), 0) + (prize?.hiddenMedia ? 1 : 0) + (prize?.revealedMedia ? 1 : 0);
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
            .map((question) => ({
                ...question,
                points: question.isSurpriseQuestion ? getSurpriseDisplayPoints(question) : normalizePoints(question.points)
            }))
    }))
    .filter((category) => category.questions.length > 0);

function PreviewBoardGrid({ categories, onCategorySelect, onQuestionSelect, t }) {
    return (
        <div
            className="grid min-h-[28rem] min-w-[44rem] flex-1 gap-4"
            style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(8rem, 1fr))` }}
        >
            {categories.map((cat, i) => (
                <div key={cat.id || i} className="flex min-h-0 flex-col gap-4">
                    <button
                        type="button"
                        onClick={() => onCategorySelect(cat.id)}
                        aria-label={t('jumpToCategory', { name: cat.name })}
                        title={t('jumpToCategory', { name: cat.name })}
                        className="flex min-h-[4rem] items-center justify-center rounded-lg border-2 border-blue-500 bg-blue-900 p-3 text-center shadow-md shadow-black/50 transition-colors hover:border-blue-300 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 focus:ring-offset-slate-900"
                    >
                        <span className="break-words text-sm font-bold uppercase leading-tight tracking-wide text-blue-100 drop-shadow-md md:text-base">
                            {cat.name}
                        </span>
                    </button>

                    <div className="flex min-h-0 flex-1 flex-col gap-4">
                        {cat.questions.map((q) => (
                            <button
                                type="button"
                                disabled={!isPreviewReadyQuestion(q)}
                                onClick={() => onQuestionSelect(cat.id, q.id)}
                                aria-label={t('previewQuestion', { category: cat.name, points: q.points })}
                                title={isPreviewReadyQuestion(q) ? undefined : t('previewQuestionBlocked')}
                                key={q.id}
                                className="flex min-h-20 flex-1 transition-colors enabled:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 items-center justify-center gap-2 rounded-lg bg-blue-800 font-mono text-2xl font-black text-yellow-400 shadow-[inset_0_-4px_0_0_rgba(0,0,0,0.3)] shadow-black md:text-4xl"
                            >
                                {!isPreviewReadyQuestion(q) && <Lock size={18} aria-hidden="true" className="shrink-0" />}
                                {q.points}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function QuestionPackPreviewModal({ categories, roundNumber, onCategorySelect, onClose, t }) {
    const [selection, setSelection] = useState(null);
    const [answerRevealed, setAnswerRevealed] = useState(false);
    const selectedCategory = categories.find(category => category.id === selection?.categoryId);
    const selectedQuestion = selectedCategory?.questions.find(question => question.id === selection?.questionId);
    const activeQuestion = selectedQuestion && isPreviewReadyQuestion(selectedQuestion) ? selectedQuestion : null;

    const handleQuestionSelect = (categoryId, questionId) => {
        const question = categories.find(category => category.id === categoryId)?.questions.find(item => item.id === questionId);
        if (!question || !isPreviewReadyQuestion(question)) return;
        setAnswerRevealed(false);
        setSelection({ categoryId, questionId });
    };

    const handleBackToTable = () => {
        setSelection(null);
        setAnswerRevealed(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6">
            <div className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 p-5">
                    <h2 className="min-w-0 pr-4 text-xl font-bold text-white">{t('questionPackPreview')} · {t('packRound', { round: roundNumber })}</h2>
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
                    {activeQuestion ? (
                        <div
                            key={activeQuestion.id}
                            className={`active-question-enter-shell ${activeQuestion.isSurpriseQuestion ? 'active-question-enter-shell--surprise' : ''} relative mx-auto flex min-h-[28rem] w-full max-w-4xl flex-col items-center text-center`}
                        >
                            <div className={`relative flex w-full flex-1 flex-col items-center ${answerRevealed ? 'justify-center' : 'justify-start'}`}>
                                <QuestionPresenter
                                    question={activeQuestion}
                                    categoryName={selectedCategory.name}
                                    isAnswerRevealed={answerRevealed}
                                    t={t}
                                />
                            </div>
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="flex min-h-[18rem] items-center justify-center rounded-lg border border-dashed border-slate-700 p-8 text-center text-slate-400">
                            {t('noPreviewQuestions')}
                        </div>
                    ) : (
                        <PreviewBoardGrid categories={categories} onCategorySelect={onCategorySelect} onQuestionSelect={handleQuestionSelect} t={t} />
                    )}
                </div>
                {activeQuestion && (
                    <div className="flex shrink-0 flex-wrap justify-center gap-3 border-t border-slate-800 p-4">
                        {!answerRevealed && (
                            <button type="button" onClick={() => setAnswerRevealed(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-3 font-bold text-white hover:bg-green-500">
                                <Eye size={18} /> {t('previewRevealAnswer')}
                            </button>
                        )}
                        <button type="button" onClick={handleBackToTable} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700 px-5 py-3 font-bold text-white hover:bg-slate-600">
                            <ArrowLeft size={18} /> {t('previewBackToTable')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function PackCreator({ pack, setView, user, setError }) {
    const { language, t } = useLanguage();
    const isEditMode = Boolean(pack?.id);
    const [persistedPackId, setPersistedPackId] = useState(pack?.id || null);
    const [packName, setPackName] = useState(pack?.name || '');
    const [packIconEmoji, setPackIconEmoji] = useState(pack?.iconEmoji || '');
    const [isPublic, setIsPublic] = useState(Boolean(pack?.isPublic));
    const [surpriseScoringMechanic, setSurpriseScoringMechanic] = useState(() => (
        normalizeSurpriseScoringMechanic(pack?.surpriseScoringMechanic)
    ));
    const [prize, setPrize] = useState(() => pack?.prize || {});
    const [roundIds, setRoundIds] = useState(() => pack ? getPackRounds(pack).map((round) => round.id || generateId()) : [generateId()]);
    const [activeRoundId, setActiveRoundId] = useState(roundIds[0]);
    const roundIdsRef = useRef(roundIds);
    roundIdsRef.current = roundIds;
    // Local flat editing state keeps async media callbacks bound to globally unique IDs.
    // Only nested rounds are persisted.
    const [categories, setCategories] = useState(() => ensureEditableCategoryIds(
        pack ? getPackRounds(pack).flatMap((round, index) => (round.categories?.length ? round.categories : createDefaultCategories(t, getRoundPointStep(index)))
            .map((category) => ({ ...category, roundId: roundIds[index], questions: category.questions?.length ? category.questions : [createEmptyQuestion(getRoundPointStep(index))] })))
            : createDefaultCategories(t).map((category) => ({ ...category, roundId: roundIds[0] })), t));
    const visibleCategories = categories.filter((category) => category.roundId === activeRoundId);
    const roundPluralRules = new Intl.PluralRules(language);
    const roundCountUnit = (kind, count) => {
        const form = roundPluralRules.select(count);
        return t(`round${kind}${form[0].toUpperCase()}${form.slice(1)}`);
    };
    const serializeRounds = (sourceCategories) => roundIdsRef.current.map((id) => ({ id,
        categories: stripPendingCategories(sourceCategories.filter((category) => category.roundId === id)).map((category) => {
            const saved = { ...category }; delete saved.roundId; return saved;
        })
    }));
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const saveInFlightRef = useRef(false);
    const mountedRef = useRef(false);
    const savedTimerRef = useRef(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [pendingRoundRemoval, setPendingRoundRemoval] = useState(null);
    const [pendingMediaPaste, setPendingMediaPaste] = useState(null);
    const [collapsedCategoryIds, setCollapsedCategoryIds] = useState(() => new Set());
    const [mediaBusy, setMediaBusy] = useState(false);
    const [remoteMediaBusy, setRemoteMediaBusy] = useState(false);
    const remoteMediaBusyRef = useRef(false);
    const [mediaProgress, setMediaProgress] = useState({});
    const [mediaErrors, setMediaErrors] = useState({});
    const categoriesRef = useRef(categories);
    const prizeRef = useRef(prize);
    const categoryElementsRef = useRef({});

    categoriesRef.current = categories;
    prizeRef.current = prize;
    const hasActiveMediaAction = remoteMediaBusy || mediaBusy || Object.values(mediaProgress).some((value) => value > 0 && value < 100);
    const packSummary = getPackSummary(categories, prize);
    const previewCategories = getPreviewCategories(visibleCategories);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            clearTimeout(savedTimerRef.current);
        };
    }, []);

    const idleSaveLabel = isEditMode ? t('updatePack') : t('savePack');
    const saveLabel = isSaving ? t('saving') : isSaved ? t('packSaved') : idleSaveLabel;

    useEffect(() => () => {
        categoriesRef.current.forEach((category) => {
            category.questions.forEach((question) => {
                [question.questionMedia, question.answerMedia].forEach((media) => {
                    if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
                });
            });
        });
        [prizeRef.current?.hiddenMedia, prizeRef.current?.revealedMedia].forEach((media) => {
            if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
        });
    }, []);

    const handleBack = () => {
        setView(isEditMode ? 'managePacks' : 'menu');
    };

    const addCategory = () => {
        setCategories((currentCategories) => [
            ...currentCategories,
            { id: generateId(), roundId: activeRoundId, name: t('newCategory'), questions: [createEmptyQuestion(getRoundPointStep(roundIds.indexOf(activeRoundId)))] }
        ]);
    };

    const getPackRef = (packId) => doc(db, 'artifacts', appId, 'public', 'data', 'packs', packId);

    const getPackData = (sourceCategories, timestamp = Date.now(), sourcePrize = prizeRef.current) => ({
        name: packName.trim() || t('untitledPack'),
        iconEmoji: packIconEmoji,
        ownerId: user.uid,
        ownerEmail: user.email || null,
        surpriseScoringMechanic,
        prize: cleanPrizeForSave(sourcePrize),
        updatedAt: timestamp,
        rounds: serializeRounds(sourceCategories)
    });

    const ensurePackForMediaAction = async (sourceCategories = categories, sourcePrize = prizeRef.current) => {
        if (persistedPackId) {
            const timestamp = Date.now();
            await updateDoc(getPackRef(persistedPackId), { ...getPackData(sourceCategories, timestamp, sourcePrize), categories: deleteField() });
            return persistedPackId;
        }

        const packsRef = collection(db, 'artifacts', appId, 'public', 'data', 'packs');
        const newPackRef = doc(packsRef);
        const timestamp = Date.now();
        await setDoc(newPackRef, {
            ...getPackData(sourceCategories, timestamp, sourcePrize),
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
            rounds: serializeRounds(nextCategories), categories: deleteField(),
            updatedAt: Date.now()
        });
    };

    const persistPrizeIfNeeded = async (nextPrize) => {
        if (!persistedPackId) return;
        await updateDoc(getPackRef(persistedPackId), {
            prize: cleanPrizeForSave(nextPrize),
            updatedAt: Date.now()
        });
    };

    const addRound = () => {
        if (roundIds.length >= MAX_PACK_ROUNDS || hasActiveMediaAction || isSaving) return;
        const id = generateId();
        setRoundIds([...roundIds, id]);
        setCategories((current) => [...current, { id: generateId(), roundId: id, name: t('newCategory'), questions: [createEmptyQuestion(getRoundPointStep(roundIds.length))] }]);
        setActiveRoundId(id);
    };
    const removeRound = async (roundId) => {
        if (roundIds.length <= 1 || !roundIds.includes(roundId) || hasActiveMediaAction || isSaving) return;
        setPendingRoundRemoval(null);
        const removed = categories.filter((category) => category.roundId === roundId);
        const next = categories.filter((category) => category.roundId !== roundId);
        const ids = roundIds.filter((id) => id !== roundId);
        setIsSaving(true);
        try {
            if (persistedPackId) await updateDoc(getPackRef(persistedPackId), {
                rounds: serializeRounds(next).filter((round) => round.id !== roundId), categories: deleteField(), updatedAt: Date.now()
            });
            setRoundIds(ids); setCategories(next); setActiveRoundId(ids[0]);
            await deleteMediaNow(removed.flatMap((category) => category.questions.flatMap(getSavedMediaFromQuestion)));
        } catch (err) { setError(err.messageKey ? t(err.messageKey) : err.message); }
        finally { setIsSaving(false); }
    };

    const removeCategory = async (catId) => {
        if (visibleCategories.length <= 1 || hasActiveMediaAction || isSaving) return;
        const category = categories.find((item) => item.id === catId);
        const nextCategories = categories.filter(c => c.id !== catId);
        setCategories(nextCategories);
        setCollapsedCategoryIds((currentIds) => {
            const nextIds = new Set(currentIds);
            nextIds.delete(catId);
            return nextIds;
        });
        try {
            await persistCategoriesIfNeeded(nextCategories);
            await deleteMediaNow((category?.questions || []).flatMap(getSavedMediaFromQuestion));
        } catch (err) {
            console.error("Media delete error:", err);
            setError(err.messageKey ? t(err.messageKey) : err.message);
        }
    };

    const updateCategoryName = (catId, name) => {
        setCategories((currentCategories) => (
            currentCategories.map(c => c.id === catId ? { ...c, name } : c)
        ));
    };

    const moveCategory = (catId, direction) => {
        setCategories((currentCategories) => {
            const currentIndex = currentCategories.findIndex((category) => category.id === catId);
            const siblings = currentCategories.filter((category) => category.roundId === currentCategories[currentIndex].roundId);
            const siblingIndex = siblings.findIndex((category) => category.id === catId);
            const target = siblings[siblingIndex + direction];
            if (!target) return currentCategories;
            const next = [...currentCategories];
            const nextIndex = currentCategories.findIndex((category) => category.id === target.id);
            [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
            return next;
        });
    };

    const toggleCategoryCollapsed = (catId) => {
        setCollapsedCategoryIds((currentIds) => {
            const nextIds = new Set(currentIds);
            if (nextIds.has(catId)) {
                nextIds.delete(catId);
            } else {
                nextIds.add(catId);
            }
            return nextIds;
        });
    };

    const setCategoryElement = (catId) => (element) => {
        if (element) {
            categoryElementsRef.current[catId] = element;
        } else {
            delete categoryElementsRef.current[catId];
        }
    };

    const scrollToCategory = (catId) => {
        categoryElementsRef.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handlePreviewCategorySelect = (catId) => {
        setIsPreviewOpen(false);
        setCollapsedCategoryIds((currentIds) => {
            const nextIds = new Set(currentIds);
            nextIds.delete(catId);
            return nextIds;
        });
        window.requestAnimationFrame(() => scrollToCategory(catId));
    };

    const collapseAllCategories = () => {
        setCollapsedCategoryIds(new Set(categories.map((category) => category.id)));
    };

    const addQuestion = (catId) => {
        setCategories((currentCategories) => currentCategories.map(c => {
            if (c.id === catId) {
                const lastPoints = c.questions.length > 0 ? normalizePoints(c.questions[c.questions.length - 1].points, 0) : 0;
                const pointStep = getRoundPointStep(roundIds.indexOf(c.roundId));
                return { ...c, questions: [...c.questions, createEmptyQuestion(lastPoints + pointStep)] };
            }
            return c;
        }));
    };

    const moveQuestion = (catId, qId, direction) => {
        setCategories((currentCategories) => currentCategories.map((category) => {
            if (category.id !== catId) return category;

            const currentIndex = category.questions.findIndex((question) => question.id === qId);
            const nextIndex = currentIndex + direction;
            const nextQuestions = reorderItem(category.questions, currentIndex, nextIndex);
            if (nextQuestions === category.questions) return category;

            return { ...category, questions: nextQuestions };
        }));
    };

    const updateQuestion = (catId, qId, field, value) => {
        setCategories((currentCategories) => currentCategories.map(c => {
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
        setCategories((currentCategories) => currentCategories.map(c => {
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
        if (category?.questions.length <= 1 || hasActiveMediaAction || isSaving) return;
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

    const handleQuestionMediaPaste = (event, catId, qId, field) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return;
        const clipboardFiles = Array.from(clipboard.files || []);
        const files = clipboardFiles.length ? clipboardFiles : Array.from(clipboard.items || [])
            .filter((item) => item.kind === 'file')
            .map((item) => item.getAsFile()).filter(Boolean);
        if (!files.length) return;

        // File pastes belong to the attachment slot; leave ordinary text pastes alone.
        event.preventDefault();
        const progressKey = `${qId}:${field}`;
        const showPasteError = (messageKey) => setMediaErrors((errors) => ({
            ...errors, [progressKey]: t(messageKey)
        }));
        if (hasActiveMediaAction || isSaving || remoteMediaBusyRef.current || pendingMediaPaste) {
            showPasteError('mediaActionInProgress');
            return;
        }
        if (files.length !== 1) {
            showPasteError('mediaPasteOneFile');
            return;
        }
        const file = files[0];
        const validation = validateMediaFile(file);
        if (!validation.valid) {
            showPasteError(validation.messageKey);
            return;
        }
        const question = categoriesRef.current.find((category) => category.id === catId)
            ?.questions.find((item) => item.id === qId);
        if (!question) return;
        setPendingMediaPaste({ file, catId, qId, field, replacing: Boolean(question[field]) });
    };

    const confirmMediaPaste = () => {
        if (!pendingMediaPaste || hasActiveMediaAction || isSaving || remoteMediaBusyRef.current) return;
        const { file, catId, qId, field } = pendingMediaPaste;
        setPendingMediaPaste(null);
        const question = categoriesRef.current.find((category) => category.id === catId)
            ?.questions.find((item) => item.id === qId);
        if (!question) return;
        const validation = validateMediaFile(file);
        if (!validation.valid) {
            setMediaErrors((errors) => ({ ...errors, [`${qId}:${field}`]: t(validation.messageKey) }));
            return;
        }
        void updateQuestionMedia(catId, qId, field, file);
    };

    const resolveDroppedMedia = async (resolveFile, applyFile) => {
        if (hasActiveMediaAction || isSaving || remoteMediaBusyRef.current) return;
        remoteMediaBusyRef.current = true;
        setRemoteMediaBusy(true);
        try {
            const file = await resolveFile();
            if (!mountedRef.current) return;
            // applyFile captures the idle editor before the download lock was set.
            // Hand the lock directly to the existing upload flow without an idle render.
            setRemoteMediaBusy(false);
            await applyFile(file);
        } finally {
            remoteMediaBusyRef.current = false;
            if (mountedRef.current) setRemoteMediaBusy(false);
        }
    };

    const updateQuestionMedia = async (catId, qId, field, file) => {
        if (hasActiveMediaAction || isSaving) return;
        setMediaBusy(true);
        const sourceCategories = categoriesRef.current;
        const previewUrl = URL.createObjectURL(file);
        const progressKey = `${qId}:${field}`;
        const previousQuestion = sourceCategories
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
        const previewCategories = setQuestionMediaInCategories(sourceCategories, catId, qId, field, previewMedia);

        setMediaErrors((errors) => ({ ...errors, [`${qId}:${field}`]: '' }));
        setMediaProgress((progress) => ({ ...progress, [progressKey]: 1 }));
        setCategories(previewCategories);

        try {
            const packId = await ensurePackForMediaAction(stripPendingCategories(sourceCategories));
            const uploadedMedia = await uploadMedia(file, {
                packId,
                questionId: qId,
                slot: field,
                onProgress: (value) => setMediaProgress((progress) => ({ ...progress, [progressKey]: value }))
            });
            const nextCategories = setQuestionMediaInCategories(categoriesRef.current, catId, qId, field, uploadedMedia);
            setCategories(nextCategories);
            await updateDoc(getPackRef(packId), {
                rounds: serializeRounds(nextCategories), categories: deleteField(),
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
            setMediaBusy(false);
            URL.revokeObjectURL(previewUrl);
        }
    };

    const removeQuestionMedia = async (catId, qId, field) => {
        if (hasActiveMediaAction || isSaving) return;
        setMediaBusy(true);
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
                    rounds: serializeRounds(nextCategories), categories: deleteField(),
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
        } finally { setMediaBusy(false); }
    };

    const updatePrizeMedia = async (slot, file) => {
        if (hasActiveMediaAction || isSaving) return;
        setMediaBusy(true);
        const previewUrl = URL.createObjectURL(file);
        const progressKey = `${PACK_PRIZE_MEDIA_ID}:${slot}`;
        const previousPrize = prizeRef.current || {};
        const previousMedia = previousPrize[getPrizeMediaField(slot)];
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
        const previewPrize = setPrizeMedia(previousPrize, slot, previewMedia);

        setMediaErrors((errors) => ({ ...errors, [progressKey]: '' }));
        setMediaProgress((progress) => ({ ...progress, [progressKey]: 1 }));
        setPrize(previewPrize);

        try {
            const packId = await ensurePackForMediaAction(stripPendingCategories(categoriesRef.current), previousPrize);
            const uploadedMedia = await uploadMedia(file, {
                packId,
                questionId: PACK_PRIZE_MEDIA_ID,
                slot,
                onProgress: (value) => setMediaProgress((progress) => ({ ...progress, [progressKey]: value }))
            });
            const nextPrize = setPrizeMedia(prizeRef.current, slot, uploadedMedia);
            setPrize(nextPrize);
            await updateDoc(getPackRef(packId), {
                prize: cleanPrizeForSave(nextPrize),
                updatedAt: Date.now()
            });
            if (previousMedia?.fileId) {
                await deleteMedia(previousMedia);
            }
            setMediaProgress((progress) => ({ ...progress, [progressKey]: 100 }));
        } catch (err) {
            console.error("Prize media upload error:", err);
            setPrize(previousPrize);
            setMediaProgress((progress) => ({ ...progress, [progressKey]: 0 }));
            setMediaErrors((errors) => ({ ...errors, [progressKey]: err.messageKey ? t(err.messageKey) : err.message }));
            setError(err.messageKey ? t(err.messageKey) : err.message);
        } finally {
            setMediaBusy(false);
            URL.revokeObjectURL(previewUrl);
        }
    };

    const removePrizeMedia = async (slot) => {
        if (hasActiveMediaAction || isSaving) return;
        setMediaBusy(true);
        const progressKey = `${PACK_PRIZE_MEDIA_ID}:${slot}`;
        const previousPrize = prizeRef.current || {};
        const previousMedia = previousPrize[getPrizeMediaField(slot)];
        const nextPrize = setPrizeMedia(previousPrize, slot, null);

        setMediaErrors((errors) => ({ ...errors, [progressKey]: '' }));
        setPrize(nextPrize);

        try {
            await persistPrizeIfNeeded(nextPrize);
            if (previousMedia?.fileId) {
                await deleteMedia(previousMedia);
            }
        } catch (err) {
            console.error("Prize media delete error:", err);
            setPrize(previousPrize);
            setMediaErrors((errors) => ({ ...errors, [progressKey]: err.messageKey ? t(err.messageKey) : err.message }));
            setError(err.messageKey ? t(err.messageKey) : err.message);
        } finally { setMediaBusy(false); }
    };

    const validateQuestions = () => {
        const invalid = validatePackRounds({ rounds: serializeRounds(categories) });
        if (invalid) { setActiveRoundId(roundIds[invalid.roundIndex]); setError(t(invalid.key)); return false; }
        for (const category of categories) {
            for (const question of category.questions) {
                if (!question.text.trim() && !hasEffectiveMedia(question, MEDIA_SLOTS.QUESTION)) {
                    setActiveRoundId(category.roundId); setError(t('questionTextOrMediaRequired'));
                    return false;
                }

                if (!question.answer.trim() && !hasEffectiveMedia(question, MEDIA_SLOTS.ANSWER)) {
                    setActiveRoundId(category.roundId); setError(t('answerTextOrMediaRequired'));
                    return false;
                }
            }
        }

        return true;
    };

    const handleSave = async () => {
        if (saveInFlightRef.current) return;
        clearTimeout(savedTimerRef.current);
        setIsSaved(false);
        setError('');
        if (!packName.trim()) return setError(t('pleaseEnterPackName'));
        if (hasActiveMediaAction) return setError(t('mediaActionInProgress'));
        if (!validateQuestions()) return;

        saveInFlightRef.current = true;
        setIsSaving(true);
        setMediaErrors({});
        const isUpdating = Boolean(persistedPackId);

        try {
            const finalCategories = stripPendingCategories(categories);

            const packData = {
                name: packName,
                iconEmoji: packIconEmoji,
                isPublic,
                ownerId: user.uid,
                ownerEmail: user.email || null,
                surpriseScoringMechanic,
                prize: cleanPrizeForSave(prize),
                updatedAt: Date.now(),
                rounds: serializeRounds(finalCategories)
            };

            if (persistedPackId) {
                await updateDoc(getPackRef(persistedPackId), { ...packData, categories: deleteField() });
            } else {
                const packsRef = collection(db, 'artifacts', appId, 'public', 'data', 'packs');
                const createdDoc = await addDoc(packsRef, {
                    ...packData,
                    createdAt: Date.now()
                });
                if (mountedRef.current) setPersistedPackId(createdDoc.id);
            }

            trackEvent(isUpdating ? 'pack_updated' : 'pack_created', getPackAnalyticsSummary(packData));
            if (mountedRef.current) {
                setIsSaved(true);
                savedTimerRef.current = setTimeout(() => setIsSaved(false), 2000);
            }
        } catch (err) {
            console.error("Save error:", err);
            if (mountedRef.current) {
                setError(getFirestoreErrorMessage(err, isUpdating ? t('updatePackAction') : t('savePackAction'), language));
            }
        } finally {
            saveInFlightRef.current = false;
            if (mountedRef.current) setIsSaving(false);
        }
    };

    return (
        <div className="mx-auto grid min-h-screen w-full min-w-0 max-w-4xl grid-cols-1 content-start gap-x-3 p-4 sm:grid-cols-[minmax(0,1fr),auto] sm:p-6">
            {pendingRoundRemoval && (
                <DeleteRoundDialog
                    roundNumber={roundIds.indexOf(pendingRoundRemoval) + 1}
                    disabled={isSaving || hasActiveMediaAction}
                    onCancel={() => setPendingRoundRemoval(null)}
                    onConfirm={() => removeRound(pendingRoundRemoval)}
                    t={t}
                />
            )}
            {pendingMediaPaste && (
                <MediaPasteDialog
                    file={pendingMediaPaste.file}
                    targetLabel={t(pendingMediaPaste.field === MEDIA_SLOTS.QUESTION ? 'mediaPasteQuestionTarget' : 'mediaPasteAnswerTarget')}
                    replacing={pendingMediaPaste.replacing}
                    disabled={isSaving || hasActiveMediaAction}
                    onCancel={() => setPendingMediaPaste(null)}
                    onConfirm={confirmMediaPaste}
                    t={t}
                />
            )}
            {isPreviewOpen && (
                <QuestionPackPreviewModal
                    categories={previewCategories}
                    roundNumber={roundIds.indexOf(activeRoundId) + 1}
                    t={t}
                    onCategorySelect={handlePreviewCategorySelect}
                    onClose={() => setIsPreviewOpen(false)}
                />
            )}
            <div className="mb-3 flex min-w-0 items-center gap-3 sm:mb-8">
                <button onClick={handleBack} className="shrink-0 rounded-full p-2 transition-colors hover:bg-slate-800">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="min-w-0 flex-1 text-2xl font-bold sm:text-3xl">{isEditMode ? t('editQuestionPack') : t('createQuestionPack')}</h2>
            </div>
            <div className="sticky top-4 z-40 mb-8 self-start sm:top-6">
                <button
                    onClick={handleSave}
                    disabled={isSaving || hasActiveMediaAction}
                    aria-label={saveLabel}
                    aria-busy={isSaving}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-2 font-bold text-white shadow-lg hover:bg-green-500 disabled:opacity-50 sm:w-auto"
                >
                    <Check size={20} aria-hidden="true" />
                    <span aria-hidden="true" className="grid">
                        {[idleSaveLabel, t('saving'), t('packSaved')].map((label, index) => (
                            <span key={index} className={`col-start-1 row-start-1 transition-opacity duration-200 motion-reduce:transition-none ${index === (isSaving ? 1 : isSaved ? 2 : 0) ? 'opacity-100' : 'opacity-0'}`}>
                                {label}
                            </span>
                        ))}
                    </span>
                </button>
                <span role="status" aria-live="polite" className="sr-only">{saveLabel}</span>
            </div>

            <div className="col-span-full min-w-0">
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-8">
                <div className="grid gap-4 sm:grid-cols-[auto,minmax(0,1fr)]">
                    <EmojiPicker
                        value={packIconEmoji}
                        onChange={setPackIconEmoji}
                        onClear={() => setPackIconEmoji('')}
                        disabled={isSaving || hasActiveMediaAction}
                        label={t('packIcon')}
                        searchPlaceholder={t('emojiSearchPlaceholder')}
                        clearLabel={t('clearPackIcon')}
                        noResultsLabel={t('emojiNoResults')}
                    />
                    <label className="block min-w-0">
                        <span className="mb-2 block text-sm font-medium text-slate-400">{t('packName')}</span>
                        <input
                            type="text"
                            value={packName}
                            onChange={(e) => setPackName(e.target.value)}
                            placeholder={t('packNamePlaceholder')}
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                    </label>
                </div>
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
                <div className="flex flex-col gap-4">
                    <label className="flex cursor-pointer flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4 transition-colors hover:border-slate-600 sm:flex-row sm:items-center">
                        <span className="min-w-0 flex-1">
                            <span className="block font-bold text-white">{t('availableToEveryone')}</span>
                            <span className="mt-1 block text-sm text-slate-400">{t('availableToEveryoneHelp')}</span>
                        </span>
                        <span className="relative inline-flex h-7 w-12 shrink-0 items-center">
                            <input
                                type="checkbox"
                                checked={isPublic}
                                onChange={(event) => setIsPublic(event.target.checked)}
                                disabled={isSaving || hasActiveMediaAction}
                                className="peer sr-only"
                            />
                            <span className="absolute inset-0 rounded-full bg-slate-700 transition-colors peer-checked:bg-green-600 peer-disabled:opacity-50" />
                            <span className="absolute left-1 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5 peer-disabled:opacity-80" />
                        </span>
                    </label>
                    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                        <div className="mb-3 font-bold text-white">{t('surpriseScoringMechanic')}</div>
                        <div className="grid gap-3 md:grid-cols-2">
                            {[
                                {
                                    value: SURPRISE_SCORING_MECHANICS.wheel,
                                    label: t('surpriseMechanicWheel'),
                                    hint: t('surpriseMechanicWheelHint')
                                },
                                {
                                    value: SURPRISE_SCORING_MECHANICS.table,
                                    label: t('surpriseMechanicTable'),
                                    hint: t('surpriseMechanicTableHint')
                                }
                            ].map((option) => {
                                const isSelected = surpriseScoringMechanic === option.value;

                                return (
                                    <label
                                        key={option.value}
                                        className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${isSelected ? 'border-yellow-400 bg-yellow-950/30' : 'border-slate-700 bg-slate-950 hover:border-slate-600'}`}
                                    >
                                        <input
                                            type="radio"
                                            name="surpriseScoringMechanic"
                                            value={option.value}
                                            checked={isSelected}
                                            onChange={(event) => setSurpriseScoringMechanic(event.target.value)}
                                            disabled={isSaving || hasActiveMediaAction}
                                            className="mt-1 h-4 w-4 shrink-0 accent-yellow-400"
                                        />
                                        <span className="min-w-0">
                                            <span className="block font-black text-slate-100">{option.label}</span>
                                            <span className="mt-1 block text-sm leading-relaxed text-slate-400">{option.hint}</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="mb-8 rounded-xl border border-slate-700 bg-slate-800/50 p-5">
                <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-slate-400">{t('prize')}</h3>
                <div className="space-y-4">
                    <p className="text-sm text-slate-400">{t('prizeHelp')}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <div className="mb-2 text-sm font-bold text-white">{t('prizeHiddenMedia')}</div>
                            <PackMediaAttachment
                                media={prize?.hiddenMedia}
                                label={t('prizeHiddenMedia')}
                                disabled={isSaving || hasActiveMediaAction}
                                progress={mediaProgress[`${PACK_PRIZE_MEDIA_ID}:${MEDIA_SLOTS.PRIZE_HIDDEN}`] || 0}
                                error={mediaErrors[`${PACK_PRIZE_MEDIA_ID}:${MEDIA_SLOTS.PRIZE_HIDDEN}`]}
                                t={t}
                                accept="image/*"
                                allowedKinds={[MEDIA_KINDS.IMAGE]}
                                hint={t('prizeImageUploadHint')}
                                onChange={(file) => updatePrizeMedia(MEDIA_SLOTS.PRIZE_HIDDEN, file)}
                                onResolveFile={(resolveFile) => resolveDroppedMedia(resolveFile, (file) => updatePrizeMedia(MEDIA_SLOTS.PRIZE_HIDDEN, file))}
                                onRemove={() => removePrizeMedia(MEDIA_SLOTS.PRIZE_HIDDEN)}
                            />
                        </div>
                        <div>
                            <div className="mb-2 text-sm font-bold text-white">{t('prizeRevealedMedia')}</div>
                            <PackMediaAttachment
                                media={prize?.revealedMedia}
                                label={t('prizeRevealedMedia')}
                                disabled={isSaving || hasActiveMediaAction}
                                progress={mediaProgress[`${PACK_PRIZE_MEDIA_ID}:${MEDIA_SLOTS.PRIZE_REVEALED}`] || 0}
                                error={mediaErrors[`${PACK_PRIZE_MEDIA_ID}:${MEDIA_SLOTS.PRIZE_REVEALED}`]}
                                t={t}
                                accept="image/*"
                                allowedKinds={[MEDIA_KINDS.IMAGE]}
                                hint={t('prizeImageUploadHint')}
                                onChange={(file) => updatePrizeMedia(MEDIA_SLOTS.PRIZE_REVEALED, file)}
                                onResolveFile={(resolveFile) => resolveDroppedMedia(resolveFile, (file) => updatePrizeMedia(MEDIA_SLOTS.PRIZE_REVEALED, file))}
                                onRemove={() => removePrizeMedia(MEDIA_SLOTS.PRIZE_REVEALED)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 pb-12">
                <div className="mb-6 space-y-3">
                    <div role="tablist" aria-label={t('packRounds')} className="flex flex-wrap gap-2">
                        {roundIds.map((id, index) => {
                            const items = categories.filter((category) => category.roundId === id);
                            const questionCount = items.reduce((count, category) => count + category.questions.length, 0);
                            return <button key={id} id={id + '-tab'} role="tab" aria-selected={activeRoundId === id} aria-controls="round-editor"
                                tabIndex={activeRoundId === id ? 0 : -1}
                                onKeyDown={(event) => {
                                    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                                    const target = event.key === 'Home' ? 0 : event.key === 'End' ? roundIds.length - 1 : (index + offset + roundIds.length) % roundIds.length;
                                    if (!offset && !['Home', 'End'].includes(event.key)) return;
                                    event.preventDefault(); setActiveRoundId(roundIds[target]);
                                    document.getElementById(roundIds[target] + '-tab')?.focus();
                                }}
                                onClick={() => setActiveRoundId(id)} className={`rounded-xl border px-4 py-3 text-left ${activeRoundId === id ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300' : 'border-slate-600 text-slate-300'}`}>
                                <span className="block font-bold">{t('packRound', { round: index + 1 })}</span>
                                <span className="text-xs">{t('roundCounts', { categories: items.length, categoryUnit: roundCountUnit('Category', items.length), questions: questionCount, questionUnit: roundCountUnit('Question', questionCount) })}</span>
                            </button>;
                        })}
                        <button onClick={addRound} disabled={roundIds.length >= MAX_PACK_ROUNDS || hasActiveMediaAction || isSaving}
                            className="flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-white disabled:opacity-40"><Plus size={18} />{t('addRound')}</button>
                    </div>
                    <div className={`grid gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4 sm:grid-cols-2 ${roundIds.length > 1 ? 'lg:grid-cols-3' : ''}`}>
                        <button
                            type="button"
                            onClick={collapseAllCategories}
                            className="flex min-w-0 items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800"
                        >
                            <ChevronRight size={18} className="shrink-0" />
                            <span>{t('collapseAllCategories')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsPreviewOpen(true)}
                            className="flex min-w-0 items-center justify-center gap-2 rounded-lg border border-blue-500/40 bg-blue-600/20 px-4 py-2 text-sm font-bold text-blue-100 transition-colors hover:border-blue-400 hover:bg-blue-600/30"
                        >
                            <Eye size={18} className="shrink-0" />
                            <span>{t('showQuestionPackPreview')}</span>
                        </button>
                        {roundIds.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setPendingRoundRemoval(activeRoundId)}
                                disabled={hasActiveMediaAction || isSaving}
                                className="flex min-w-0 items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-950/20 px-4 py-2 text-sm font-bold text-red-400 transition-colors hover:border-red-400 hover:bg-red-950/40 disabled:opacity-40 sm:col-span-2 lg:col-span-1"
                            >
                                <Trash2 size={18} className="shrink-0" />
                                <span>{t('removeRound')}</span>
                            </button>
                        )}
                    </div>
                </div>
                <div id="round-editor" role="tabpanel" aria-labelledby={activeRoundId + '-tab'} className="space-y-6">
                {visibleCategories.map((cat, catIdx) => {
                    const isCategoryCollapsed = collapsedCategoryIds.has(cat.id);
                    const collapseLabel = isCategoryCollapsed ? t('expandCategory') : t('collapseCategory');
                    const questionCount = cat.questions?.length || 0;

                    return (
                    <div key={cat.id} ref={setCategoryElement(cat.id)} className="min-w-0 scroll-mt-6 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 sm:p-6">
                        <div className="mb-6 flex flex-wrap items-center gap-3 sm:gap-4">
                            <button
                                type="button"
                                onClick={() => toggleCategoryCollapsed(cat.id)}
                                aria-expanded={!isCategoryCollapsed}
                                aria-label={collapseLabel}
                                title={collapseLabel}
                                className="mt-5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:border-slate-500 hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {isCategoryCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                            </button>
                            <span aria-disabled="true" className="mt-5 inline-flex min-h-10 min-w-10 shrink-0 select-none items-center justify-center rounded-lg border border-slate-700/70 bg-slate-800/70 px-3 text-sm font-bold uppercase tracking-wide text-white shadow-sm shadow-black/20">
                                {questionCount}
                            </span>
                            <div
                                onMouseDown={preventTextSelection}
                                className="mt-5 flex shrink-0 select-none overflow-hidden rounded-lg border border-slate-700 bg-slate-900"
                            >
                                <button
                                    type="button"
                                    onClick={() => moveCategory(cat.id, -1)}
                                    disabled={catIdx === 0}
                                    aria-label={t('moveCategoryUp')}
                                    title={t('moveCategoryUp')}
                                    className="flex h-10 w-10 select-none items-center justify-center text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:text-slate-700 disabled:hover:bg-transparent"
                                >
                                    <ArrowUp size={18} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveCategory(cat.id, 1)}
                                    disabled={catIdx === visibleCategories.length - 1}
                                    aria-label={t('moveCategoryDown')}
                                    title={t('moveCategoryDown')}
                                    className="flex h-10 w-10 select-none items-center justify-center border-l border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:text-slate-700 disabled:hover:bg-transparent"
                                >
                                    <ArrowDown size={18} />
                                </button>
                            </div>
                            <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                                <label className="block text-xs font-medium text-slate-500 mb-1">{t('categoryNumber', { number: catIdx + 1 })}</label>
                                <input
                                    type="text"
                                    value={cat.name}
                                    onChange={(e) => updateCategoryName(cat.id, e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-white font-bold outline-none"
                                />
                            </div>
                            {visibleCategories.length > 1 && !hasActiveMediaAction && !isSaving && <HoldToConfirmButton
                                ariaLabel={t('removeCategory')}
                                onConfirm={() => removeCategory(cat.id)}
                                title={t('holdToConfirmAction', { action: t('removeCategory') })}
                                className="mt-5 rounded-lg p-2 text-red-400 transition-colors hover:bg-red-400/10 hover:text-white"
                            >
                                <Trash2 size={20} />
                            </HoldToConfirmButton>}
                        </div>

                        {!isCategoryCollapsed && (
                        <div className="space-y-4 border-l-2 border-slate-700 pl-3 sm:pl-4">
                            {cat.questions.map((q, questionIdx) => (
                                <div key={q.id} className={`flex min-w-0 flex-wrap gap-3 rounded-lg border p-3 sm:gap-4 sm:p-4 ${q.isSurpriseQuestion ? 'border-yellow-400 bg-yellow-950/20' : 'border-transparent bg-slate-900'}`}>
                                    <div
                                        onMouseDown={preventTextSelection}
                                        className="flex shrink-0 select-none flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 self-start"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => moveQuestion(cat.id, q.id, -1)}
                                            disabled={questionIdx === 0}
                                            aria-label={t('moveQuestionUp')}
                                            title={t('moveQuestionUp')}
                                            className="flex h-9 w-9 select-none items-center justify-center text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:text-slate-700 disabled:hover:bg-transparent"
                                        >
                                            <ArrowUp size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveQuestion(cat.id, q.id, 1)}
                                            disabled={questionIdx === cat.questions.length - 1}
                                            aria-label={t('moveQuestionDown')}
                                            title={t('moveQuestionDown')}
                                            className="flex h-9 w-9 select-none items-center justify-center border-t border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:text-slate-700 disabled:hover:bg-transparent"
                                        >
                                            <ArrowDown size={16} />
                                        </button>
                                    </div>
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
                                                <p className="text-xs text-slate-400">
                                                    {t('surprisePointIncrementHint', {
                                                        increment: getRoundPointStep(roundIds.indexOf(cat.roundId)),
                                                        round: roundIds.indexOf(cat.roundId) + 1
                                                    })}
                                                </p>
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
                                    <div className="min-w-0 basis-full space-y-3 sm:basis-0 sm:flex-1">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">{t('question')}</label>
                                            <textarea
                                                value={q.text}
                                                onPaste={(event) => handleQuestionMediaPaste(event, cat.id, q.id, MEDIA_SLOTS.QUESTION)}
                                                onChange={(e) => updateQuestion(cat.id, q.id, 'text', e.target.value)}
                                                placeholder={t('questionPlaceholder')}
                                                rows={3}
                                                className="w-full resize-y bg-slate-800 border border-slate-700 rounded p-2 text-white outline-none"
                                            />
                                            <PackMediaAttachment
                                                media={q.questionMedia}
                                                label={t('questionMediaAlt')}
                                                disabled={isSaving || hasActiveMediaAction}
                                                progress={mediaProgress[`${q.id}:${MEDIA_SLOTS.QUESTION}`] || 0}
                                                error={mediaErrors[`${q.id}:${MEDIA_SLOTS.QUESTION}`]}
                                                t={t}
                                                onChange={(file) => updateQuestionMedia(cat.id, q.id, MEDIA_SLOTS.QUESTION, file)}
                                                onResolveFile={(resolveFile) => resolveDroppedMedia(resolveFile, (file) => updateQuestionMedia(cat.id, q.id, MEDIA_SLOTS.QUESTION, file))}
                                                onRemove={() => removeQuestionMedia(cat.id, q.id, MEDIA_SLOTS.QUESTION)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">{t('answer')}</label>
                                            <input
                                                type="text"
                                                value={q.answer}
                                                onPaste={(event) => handleQuestionMediaPaste(event, cat.id, q.id, MEDIA_SLOTS.ANSWER)}
                                                onChange={(e) => updateQuestion(cat.id, q.id, 'answer', e.target.value)}
                                                placeholder={t('answerPlaceholder')}
                                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-green-400 outline-none"
                                            />
                                            <PackMediaAttachment
                                                media={q.answerMedia}
                                                label={t('answerMediaAlt')}
                                                disabled={isSaving || hasActiveMediaAction}
                                                progress={mediaProgress[`${q.id}:${MEDIA_SLOTS.ANSWER}`] || 0}
                                                error={mediaErrors[`${q.id}:${MEDIA_SLOTS.ANSWER}`]}
                                                t={t}
                                                onChange={(file) => updateQuestionMedia(cat.id, q.id, MEDIA_SLOTS.ANSWER, file)}
                                                onResolveFile={(resolveFile) => resolveDroppedMedia(resolveFile, (file) => updateQuestionMedia(cat.id, q.id, MEDIA_SLOTS.ANSWER, file))}
                                                onRemove={() => removeQuestionMedia(cat.id, q.id, MEDIA_SLOTS.ANSWER)}
                                            />
                                        </div>
                                    </div>
                                    <button disabled={cat.questions.length <= 1 || hasActiveMediaAction || isSaving} aria-label={t('removeQuestion')} onClick={() => removeQuestion(cat.id, q.id)} className="text-slate-600 hover:text-red-400 transition-colors self-start mt-6">
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
                        )}
                    </div>
                    );
                })}

                <button
                    onClick={addCategory}
                    className="w-full border-2 border-dashed border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-300 p-6 rounded-xl flex items-center justify-center gap-2 font-bold transition-colors"
                >
                    <Plus size={24} /> {t('addCategory')}
                </button>
                </div>
            </div>
            </div>
        </div>
    );
}
