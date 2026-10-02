import QuestionMedia from './QuestionMedia';

// Display only: room actions and synchronized gameplay state stay with the caller.
export default function QuestionPresenter({
    question: activeQ, categoryName: activeCatName, isHost = false,
    isAnswerRevealed = false, t, questionMediaProps = {}
}) {
    const isSurpriseQuestion = Boolean(activeQ.isSurpriseQuestion);
    const hasQuestionText = Boolean(activeQ.text?.trim());
    const hasAnswerText = Boolean(activeQ.answer?.trim());
    const shouldShowQuestionContext = isHost || !isAnswerRevealed;
    const isAnswerFocused = isAnswerRevealed && !shouldShowQuestionContext;
    const hasAnswerMedia = Boolean(activeQ.answerMedia);
    const answerTextClassName = isAnswerFocused
        ? `${hasAnswerMedia ? 'text-2xl md:text-3xl lg:text-4xl' : 'text-3xl md:text-5xl lg:text-6xl'} max-w-full whitespace-pre-line break-words font-black leading-tight text-green-300 drop-shadow-lg`
        : 'break-words whitespace-pre-line text-xl font-black text-green-400 md:text-2xl';
    const questionContainerClassName = isSurpriseQuestion
        ? 'w-full rounded-2xl border-4 border-yellow-400 bg-yellow-950/40 p-4 shadow-2xl shadow-yellow-950/40 md:rounded-3xl md:p-10'
        : 'w-full rounded-2xl border-4 border-blue-600 bg-blue-900 p-4 shadow-2xl shadow-blue-900/50 md:rounded-3xl md:p-10';

    return (
        <>
            {shouldShowQuestionContext && (
                <div className="absolute top-0 flex w-full justify-between gap-3 text-xs font-bold uppercase tracking-widest text-slate-400 md:text-sm">
                    <span className="min-w-0 truncate text-left">{activeCatName}</span>
                    <span className="text-yellow-500">{t('pointsShort', { points: activeQ.points })}</span>
                </div>
            )}

            {shouldShowQuestionContext && (
                <div className={`mt-8 flex w-full min-h-0 flex-col items-center md:mt-10 ${isHost ? 'gap-4 md:gap-5' : 'gap-4 md:gap-6'}`}>
                    {hasQuestionText && (
                        <div className={questionContainerClassName}>
                            <h2
                                className="whitespace-pre-line break-words text-xl font-black leading-tight text-white drop-shadow-lg md:text-4xl"
                                style={{
                                    textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                                }}
                            >
                                {activeQ.text}
                            </h2>
                        </div>
                    )}
                    {activeQ.questionMedia && (
                        <QuestionMedia
                            media={activeQ.questionMedia}
                            alt={t('questionMediaAlt')}
                            variant={isHost ? 'host' : 'player'}
                            className={hasQuestionText ? '' : 'max-h-[52vh]'}
                            t={t}
                            {...questionMediaProps}
                        />
                    )}
                </div>
            )}

            {(isHost || isAnswerRevealed) && (
                <div className={`${isAnswerFocused ? 'flex w-full max-w-5xl flex-col items-center justify-center gap-4 py-4 md:gap-6 md:py-6' : `${shouldShowQuestionContext ? 'mt-4 md:mt-6' : 'mt-8 md:mt-10'} ${isHost ? 'max-w-2xl rounded-xl border border-slate-700 bg-slate-800 p-4 md:p-5' : 'max-w-4xl p-2 md:p-4'} w-full`}`}>
                    <p className={`${isAnswerFocused ? 'text-sm md:text-base' : 'mb-2 text-xs md:text-sm'} font-bold uppercase tracking-widest text-slate-400`}>
                        {isAnswerRevealed ? t('correctAnswer') : t('hiddenAnswer')}
                    </p>
                    {hasAnswerText && <p className={answerTextClassName}>{activeQ.answer}</p>}
                    {activeQ.answerMedia && (
                        <div className={isAnswerFocused ? 'flex w-full justify-center' : hasAnswerText ? 'mt-4 flex justify-center' : 'flex justify-center'}>
                            <QuestionMedia media={activeQ.answerMedia} alt={t('answerMediaAlt')} variant={isAnswerFocused ? 'answer' : isHost ? 'host' : 'player'} t={t} />
                        </div>
                    )}
                </div>
            )}

        </>
    );
}
