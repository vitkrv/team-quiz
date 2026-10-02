import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import HoldToConfirmButton from './HoldToConfirmButton';
import QuestionEditDialog from './QuestionEditDialog';

const controlClass = 'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 px-2 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-30';

export default function PackTableEditor({
    categories, t, disabled, selection,
    onSelect, onClose, onCategoryName, onCategoryMove, onCategoryRemove,
    onCategoryAdd, onQuestionAdd, renderQuestion,
    getDisplayPoints, isQuestionReady, setCategoryElement
}) {
    const selectedCategory = categories.find((category) => category.id === selection?.categoryId);
    const selectedQuestion = selectedCategory?.questions.find((question) => question.id === selection?.questionId);
    const selectedIndex = selectedCategory?.questions.indexOf(selectedQuestion) ?? -1;
    const header = (category, index) => (
        <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
            <label className="block min-w-0">
                <span className="mb-1 block text-xs text-slate-400">{t('categoryNumber', { number: index + 1 })} · {category.questions.length}</span>
                <input value={category.name} disabled={disabled} data-category-id={category.id}
                    onChange={(event) => onCategoryName(category.id, event.target.value)}
                    className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 font-bold focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 disabled:opacity-50" />
            </label>
            <div className="flex flex-wrap gap-2">
                <button type="button" disabled={disabled || index === 0} onClick={() => onCategoryMove(category.id, -1)}
                    aria-label={t('editorMoveCategoryEarlier')} className={controlClass}><ArrowLeft size={18} /></button>
                <button type="button" disabled={disabled || index === categories.length - 1} onClick={() => onCategoryMove(category.id, 1)}
                    aria-label={t('editorMoveCategoryLater')} className={controlClass}><ArrowRight size={18} /></button>
                {categories.length > 1 && !disabled && <HoldToConfirmButton
                    ariaLabel={t('removeCategory')} title={t('holdToConfirmAction', { action: t('removeCategory') })}
                    onConfirm={() => onCategoryRemove(category.id)} className={controlClass + ' text-red-300'}><Trash2 size={18} /></HoldToConfirmButton>}
            </div>
        </div>
    );
    const addQuestion = (category) => <button type="button" disabled={disabled} onClick={() => onQuestionAdd(category.id)}
        data-add-question={category.id} className={controlClass + ' w-full gap-2 text-blue-200'}><Plus size={18} />{t('addQuestion')}</button>;
    const rowCount = Math.max(...categories.map((category) => category.questions.length), 0);
    return (
        <div className="min-w-0 space-y-4">
            <p className="text-sm text-slate-400">{t('editorTableHelp')}</p>
            <div className="min-w-0">
                <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-700 p-3">
                    <table className="w-full table-fixed border-separate border-spacing-2 text-left" style={{ minWidth: categories.length * 240 }}>
                        <caption className="sr-only">{t('editorTableMode')}</caption>
                        <thead><tr>{categories.map((category, index) => <th key={category.id} scope="col" ref={setCategoryElement(category.id)} className="align-top font-normal">{header(category, index)}</th>)}</tr></thead>
                        <tbody>
                            {Array.from({ length: rowCount }, (_, rowIndex) => <tr key={rowIndex}>
                                {categories.map((category) => {
                                    const q = category.questions[rowIndex];
                                    if (!q) return <td key={category.id} aria-label={t('editorEmptyCell')} className="align-top" />;
                                    const selected = q.id === selectedQuestion?.id && category.id === selectedCategory?.id;
                                    return <td key={category.id} className="align-top">
                                        <button type="button" data-question-cell={q.id} disabled={disabled} aria-pressed={selected}
                                            onClick={() => onSelect(category, q, 'text')}
                                            className={`flex min-h-36 w-full flex-col gap-2 rounded-xl border p-3 text-left focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 ${selected ? 'border-blue-400 bg-blue-950/40' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}>
                                            <span className="font-mono text-xl font-black text-yellow-300">{getDisplayPoints(q)}</span>
                                            <span className="line-clamp-2 break-words text-sm text-slate-200">{q.text.trim() || t('editorNoQuestionText')}</span>
                                            <span className="flex flex-wrap gap-1 text-xs">
                                                {q.isSurpriseQuestion && <span className="rounded bg-yellow-400/10 px-2 py-1 text-yellow-200">{t('surpriseQuestion')}</span>}
                                                {q.questionMedia && <span className="rounded bg-slate-800 px-2 py-1">{t('questionMediaAlt')}</span>}
                                                {q.answerMedia && <span className="rounded bg-slate-800 px-2 py-1">{t('answerMediaAlt')}</span>}
                                                {!isQuestionReady(q) && <span className="rounded bg-orange-500/10 px-2 py-1 text-orange-200">{t('editorIncomplete')}</span>}
                                            </span>
                                        </button>
                                    </td>;
                                })}
                            </tr>)}
                            <tr>{categories.map((category) => <td key={category.id}>{addQuestion(category)}</td>)}</tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <button type="button" disabled={disabled} onClick={onCategoryAdd} className={controlClass + ' w-full gap-2 border-dashed py-3 text-slate-300'}><Plus size={20} />{t('addCategory')}</button>
            {selectedQuestion && <QuestionEditDialog
                title={selectedCategory.name + ' · ' + t('editorQuestionNumber', { number: selectedIndex + 1 })}
                validationMessage={isQuestionReady(selectedQuestion) ? '' : t(!selectedQuestion.text.trim() && !selectedQuestion.questionMedia ? 'questionTextOrMediaRequired' : 'answerTextOrMediaRequired')}
                disabled={disabled} hasPrevious={selectedIndex > 0} hasNext={selectedIndex < selectedCategory.questions.length - 1}
                onPrevious={() => onSelect(selectedCategory, selectedCategory.questions[selectedIndex - 1], 'text')}
                onNext={() => onSelect(selectedCategory, selectedCategory.questions[selectedIndex + 1], 'text')}
                onAddQuestion={() => onQuestionAdd(selectedCategory.id)}
                onClose={onClose} t={t}>
                {renderQuestion(selectedCategory, selectedQuestion, selectedIndex, false, true)}
            </QuestionEditDialog>}
        </div>
    );
}
