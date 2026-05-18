import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Check, Plus, Trash2, X } from 'lucide-react';
import PackImageAttachment from '../components/PackImageAttachment';
import { appId, db } from '../firebase';
import { deleteImage, IMAGE_SLOTS, uploadImage } from '../services/imageStorage';
import { useLanguage } from '../useLanguage';
import { generateId } from '../utils/ids';
import { getFirestoreErrorMessage } from '../utils/errors';

const createEmptyQuestion = (points = 100) => ({ id: generateId(), points, text: '', answer: '' });

const createDefaultCategories = (t) => [
    { id: generateId(), name: t('defaultCategory'), questions: [
            createEmptyQuestion(100),
            createEmptyQuestion(200)
        ]}
];

const cleanImageForSave = (image) => {
    if (!image) return null;
    const savedImage = { ...image };
    delete savedImage.previewUrl;
    delete savedImage.pendingFile;
    delete savedImage.previousImage;
    return savedImage;
};

const stripPendingCategories = (categories) => categories.map((category) => ({
    ...category,
    questions: category.questions.map((question) => {
        const nextQuestion = { ...question };
        const questionImage = cleanImageForSave(question.questionImage);
        const answerImage = cleanImageForSave(question.answerImage);

        if (questionImage) {
            nextQuestion.questionImage = questionImage;
        } else {
            delete nextQuestion.questionImage;
        }

        if (answerImage) {
            nextQuestion.answerImage = answerImage;
        } else {
            delete nextQuestion.answerImage;
        }

        return nextQuestion;
    })
}));

const hasEffectiveImage = (question, field) => Boolean(question[field]);

const getSavedImagesFromQuestion = (question) => (
    [question.questionImage, question.answerImage]
        .map((image) => image?.previousImage || image)
        .filter((image) => image?.fileId)
);

const setQuestionImageInCategories = (categories, catId, qId, field, image) => categories.map((category) => {
    if (category.id !== catId) return category;

    return {
        ...category,
        questions: category.questions.map((question) => {
            if (question.id !== qId) return question;
            const nextQuestion = { ...question };
            if (image) {
                nextQuestion[field] = image;
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
    const imageCount = categories.reduce((total, category) => (
        total + (category.questions || []).reduce((questionTotal, question) => (
            questionTotal + (question.questionImage ? 1 : 0) + (question.answerImage ? 1 : 0)
        ), 0)
    ), 0);
    const totalPoints = categories.reduce((total, category) => (
        total + (category.questions || []).reduce((questionTotal, question) => questionTotal + (Number(question.points) || 0), 0)
    ), 0);
    const averageQuestionsPerCategory = sectionCount > 0 ? questionCount / sectionCount : 0;

    return {
        sectionCount,
        questionCount,
        imageCount,
        totalPoints,
        averageQuestionsPerCategory
    };
};

export default function PackCreator({ pack, setView, user, setError, onSaved }) {
    const { language, t } = useLanguage();
    const isEditMode = Boolean(pack?.id);
    const [persistedPackId, setPersistedPackId] = useState(pack?.id || null);
    const [packName, setPackName] = useState(pack?.name || '');
    const [categories, setCategories] = useState(pack?.categories || createDefaultCategories(t));
    const [isSaving, setIsSaving] = useState(false);
    const [imageProgress, setImageProgress] = useState({});
    const [imageErrors, setImageErrors] = useState({});
    const categoriesRef = useRef(categories);

    categoriesRef.current = categories;
    const hasActiveImageAction = Object.values(imageProgress).some((value) => value > 0 && value < 100);
    const packSummary = getPackSummary(categories);

    useEffect(() => () => {
        categoriesRef.current.forEach((category) => {
            category.questions.forEach((question) => {
                [question.questionImage, question.answerImage].forEach((image) => {
                    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
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

    const ensurePackForImageAction = async (sourceCategories = categories) => {
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

    const deleteImagesNow = async (images) => {
        const savedImages = images.filter((image) => image?.fileId);
        if (savedImages.length === 0) return;
        await Promise.all(savedImages.map((image) => deleteImage(image)));
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
            await deleteImagesNow((category?.questions || []).flatMap(getSavedImagesFromQuestion));
        } catch (err) {
            console.error("Image delete error:", err);
            setError(err.messageKey ? t(err.messageKey) : err.message);
        }
    };

    const updateCategoryName = (catId, name) => {
        setCategories(categories.map(c => c.id === catId ? { ...c, name } : c));
    };

    const addQuestion = (catId) => {
        setCategories(categories.map(c => {
            if (c.id === catId) {
                const lastPoints = c.questions.length > 0 ? c.questions[c.questions.length - 1].points : 0;
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
                    questions: c.questions.map(q => q.id === qId ? { ...q, [field]: field === 'points' ? parseInt(value) || 0 : value } : q)
                };
            }
            return c;
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
            await deleteImagesNow(getSavedImagesFromQuestion(question || {}));
        } catch (err) {
            console.error("Image delete error:", err);
            setError(err.messageKey ? t(err.messageKey) : err.message);
        }
    };

    const updateQuestionImage = async (catId, qId, field, file) => {
        const previewUrl = URL.createObjectURL(file);
        const progressKey = `${qId}:${field}`;
        const previousQuestion = categories
            .find((category) => category.id === catId)
            ?.questions.find((question) => question.id === qId);
        const previousImage = previousQuestion?.[field];
        const previewImage = {
            provider: 'imagekit',
            pendingFile: file,
            previewUrl,
            name: file.name,
            size: file.size,
            mimeType: file.type,
            previousImage
        };
        const previewCategories = setQuestionImageInCategories(categories, catId, qId, field, previewImage);

        setImageErrors((errors) => ({ ...errors, [`${qId}:${field}`]: '' }));
        setImageProgress((progress) => ({ ...progress, [progressKey]: 1 }));
        setCategories(previewCategories);

        try {
            const packId = await ensurePackForImageAction(stripPendingCategories(categories));
            const uploadedImage = await uploadImage(file, {
                packId,
                questionId: qId,
                slot: field,
                onProgress: (value) => setImageProgress((progress) => ({ ...progress, [progressKey]: value }))
            });
            const nextCategories = setQuestionImageInCategories(categoriesRef.current, catId, qId, field, uploadedImage);
            setCategories(nextCategories);
            await updateDoc(getPackRef(packId), {
                categories: stripPendingCategories(nextCategories),
                updatedAt: Date.now()
            });
            if (previousImage?.fileId) {
                await deleteImage(previousImage);
            }
            setImageProgress((progress) => ({ ...progress, [progressKey]: 100 }));
        } catch (err) {
            console.error("Image upload error:", err);
            const restoredCategories = setQuestionImageInCategories(categoriesRef.current, catId, qId, field, previousImage);
            setCategories(restoredCategories);
            setImageProgress((progress) => ({ ...progress, [progressKey]: 0 }));
            setImageErrors((errors) => ({ ...errors, [progressKey]: err.messageKey ? t(err.messageKey) : err.message }));
            setError(err.messageKey ? t(err.messageKey) : err.message);
        } finally {
            URL.revokeObjectURL(previewUrl);
        }
    };

    const removeQuestionImage = async (catId, qId, field) => {
        const progressKey = `${qId}:${field}`;
        const previousQuestion = categories
            .find((category) => category.id === catId)
            ?.questions.find((question) => question.id === qId);
        const previousImage = previousQuestion?.[field];
        const nextCategories = setQuestionImageInCategories(categories, catId, qId, field, null);

        setImageErrors((errors) => ({ ...errors, [progressKey]: '' }));
        setCategories(nextCategories);

        try {
            if (persistedPackId) {
                await updateDoc(getPackRef(persistedPackId), {
                    categories: stripPendingCategories(nextCategories),
                    updatedAt: Date.now()
                });
            }
            if (previousImage?.fileId) {
                await deleteImage(previousImage);
            }
        } catch (err) {
            console.error("Image delete error:", err);
            setCategories(setQuestionImageInCategories(categoriesRef.current, catId, qId, field, previousImage));
            setImageErrors((errors) => ({ ...errors, [progressKey]: err.messageKey ? t(err.messageKey) : err.message }));
            setError(err.messageKey ? t(err.messageKey) : err.message);
        }
    };

    const validateQuestions = () => {
        for (const category of categories) {
            for (const question of category.questions) {
                if (!question.text.trim() && !hasEffectiveImage(question, IMAGE_SLOTS.QUESTION)) {
                    alert(t('questionTextOrImageRequired'));
                    return false;
                }

                if (!question.answer.trim() && !hasEffectiveImage(question, IMAGE_SLOTS.ANSWER)) {
                    alert(t('answerTextOrImageRequired'));
                    return false;
                }
            }
        }

        return true;
    };

    const handleSave = async () => {
        if (!packName.trim()) return alert(t('pleaseEnterPackName'));
        if (hasActiveImageAction) return alert(t('imageActionInProgress'));
        if (!validateQuestions()) return;

        setIsSaving(true);
        setImageErrors({});

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
            <div className="flex items-center mb-8">
                <button onClick={handleBack} className="p-2 mr-4 hover:bg-slate-800 rounded-full transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-3xl font-bold flex-1">{isEditMode ? t('editQuestionPack') : t('createQuestionPack')}</h2>
                <button
                    onClick={handleSave}
                    disabled={isSaving || hasActiveImageAction}
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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryQuestions')}</div>
                        <div className="mt-1 text-2xl font-black text-white">{packSummary.questionCount}</div>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryCategories')}</div>
                        <div className="mt-1 text-2xl font-black text-white">{packSummary.sectionCount}</div>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryImages')}</div>
                        <div className="mt-1 text-2xl font-black text-white">{packSummary.imageCount}</div>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryTotalPoints')}</div>
                        <div className="mt-1 text-2xl font-black text-yellow-400">{packSummary.totalPoints}</div>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('summaryAvgQuestions')}</div>
                        <div className="mt-1 text-2xl font-black text-white">{packSummary.averageQuestionsPerCategory.toFixed(1)}</div>
                    </div>
                </div>
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
                                <div key={q.id} className="bg-slate-900 p-4 rounded-lg flex gap-4">
                                    <div className="w-24">
                                        <label className="block text-xs text-slate-500 mb-1">{t('points')}</label>
                                        <input
                                            type="number"
                                            value={q.points}
                                            onChange={(e) => updateQuestion(cat.id, q.id, 'points', e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-yellow-400 font-mono text-center outline-none"
                                        />
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
                                            <PackImageAttachment
                                                image={q.questionImage}
                                                label={t('questionImageAlt')}
                                                disabled={isSaving || Boolean(imageProgress[`${q.id}:${IMAGE_SLOTS.QUESTION}`] > 0 && imageProgress[`${q.id}:${IMAGE_SLOTS.QUESTION}`] < 100)}
                                                progress={imageProgress[`${q.id}:${IMAGE_SLOTS.QUESTION}`] || 0}
                                                error={imageErrors[`${q.id}:${IMAGE_SLOTS.QUESTION}`]}
                                                t={t}
                                                onChange={(file) => updateQuestionImage(cat.id, q.id, IMAGE_SLOTS.QUESTION, file)}
                                                onRemove={() => removeQuestionImage(cat.id, q.id, IMAGE_SLOTS.QUESTION)}
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
                                            <PackImageAttachment
                                                image={q.answerImage}
                                                label={t('answerImageAlt')}
                                                disabled={isSaving || Boolean(imageProgress[`${q.id}:${IMAGE_SLOTS.ANSWER}`] > 0 && imageProgress[`${q.id}:${IMAGE_SLOTS.ANSWER}`] < 100)}
                                                progress={imageProgress[`${q.id}:${IMAGE_SLOTS.ANSWER}`] || 0}
                                                error={imageErrors[`${q.id}:${IMAGE_SLOTS.ANSWER}`]}
                                                t={t}
                                                onChange={(file) => updateQuestionImage(cat.id, q.id, IMAGE_SLOTS.ANSWER, file)}
                                                onRemove={() => removeQuestionImage(cat.id, q.id, IMAGE_SLOTS.ANSWER)}
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
