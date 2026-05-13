import { useState } from 'react';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Check, Plus, Trash2, X } from 'lucide-react';
import { appId, db } from '../firebase';
import { generateId } from '../utils/ids';
import { getFirestoreErrorMessage } from '../utils/errors';

const createDefaultCategories = () => [
    { id: generateId(), name: 'General Knowledge', questions: [
            { id: generateId(), points: 100, text: '', answer: '' },
            { id: generateId(), points: 200, text: '', answer: '' }
        ]}
];

export default function PackCreator({ pack, setView, user, setError, onSaved }) {
    const isEditMode = Boolean(pack?.id);
    const [packName, setPackName] = useState(pack?.name || '');
    const [categories, setCategories] = useState(pack?.categories || createDefaultCategories());
    const [isSaving, setIsSaving] = useState(false);

    const handleBack = () => {
        setView(isEditMode ? 'managePacks' : 'menu');
    };

    const addCategory = () => {
        setCategories([...categories, { id: generateId(), name: 'New Category', questions: [{ id: generateId(), points: 100, text: '', answer: '' }] }]);
    };

    const removeCategory = (catId) => {
        setCategories(categories.filter(c => c.id !== catId));
    };

    const updateCategoryName = (catId, name) => {
        setCategories(categories.map(c => c.id === catId ? { ...c, name } : c));
    };

    const addQuestion = (catId) => {
        setCategories(categories.map(c => {
            if (c.id === catId) {
                const lastPoints = c.questions.length > 0 ? c.questions[c.questions.length - 1].points : 0;
                return { ...c, questions: [...c.questions, { id: generateId(), points: lastPoints + 100, text: '', answer: '' }] };
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

    const removeQuestion = (catId, qId) => {
        setCategories(categories.map(c => {
            if (c.id === catId) {
                return { ...c, questions: c.questions.filter(q => q.id !== qId) };
            }
            return c;
        }));
    };

    const handleSave = async () => {
        if (!packName.trim()) return alert("Please enter a pack name.");
        setIsSaving(true);
        try {
            const packData = {
                name: packName,
                ownerId: user.uid,
                ownerEmail: user.email || null,
                updatedAt: Date.now(),
                categories: categories
            };

            if (isEditMode) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'packs', pack.id), packData);
            } else {
                const packsRef = collection(db, 'artifacts', appId, 'public', 'data', 'packs');
                await addDoc(packsRef, {
                    ...packData,
                    createdAt: Date.now()
                });
            }

            onSaved();
        } catch (err) {
            console.error("Save error:", err);
            setError(getFirestoreErrorMessage(err, isEditMode ? 'Update pack' : 'Save pack'));
        }
        setIsSaving(false);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 min-h-screen flex flex-col">
            <div className="flex items-center mb-8">
                <button onClick={handleBack} className="p-2 mr-4 hover:bg-slate-800 rounded-full transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-3xl font-bold flex-1">{isEditMode ? 'Edit Question Pack' : 'Create Question Pack'}</h2>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"
                >
                    <Check size={20} /> {isSaving ? 'Saving...' : isEditMode ? 'Update Pack' : 'Save Pack'}
                </button>
            </div>

            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 mb-8">
                <label className="block text-sm font-medium text-slate-400 mb-2">Pack Name</label>
                <input
                    type="text"
                    value={packName}
                    onChange={(e) => setPackName(e.target.value)}
                    placeholder="e.g. History Trivia Night"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 pb-12">
                {categories.map((cat, catIdx) => (
                    <div key={cat.id} className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-slate-500 mb-1">Category {catIdx + 1}</label>
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
                                        <label className="block text-xs text-slate-500 mb-1">Points</label>
                                        <input
                                            type="number"
                                            value={q.points}
                                            onChange={(e) => updateQuestion(cat.id, q.id, 'points', e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-yellow-400 font-mono text-center outline-none"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Question</label>
                                            <input
                                                type="text"
                                                value={q.text}
                                                onChange={(e) => updateQuestion(cat.id, q.id, 'text', e.target.value)}
                                                placeholder="Enter question text..."
                                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Answer</label>
                                            <input
                                                type="text"
                                                value={q.answer}
                                                onChange={(e) => updateQuestion(cat.id, q.id, 'answer', e.target.value)}
                                                placeholder="Enter hidden answer..."
                                                className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-green-400 outline-none"
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
                                <Plus size={16} /> Add Question
                            </button>
                        </div>
                    </div>
                ))}

                <button
                    onClick={addCategory}
                    className="w-full border-2 border-dashed border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-300 p-6 rounded-xl flex items-center justify-center gap-2 font-bold transition-colors"
                >
                    <Plus size={24} /> Add Category
                </button>
            </div>
        </div>
    );
}
