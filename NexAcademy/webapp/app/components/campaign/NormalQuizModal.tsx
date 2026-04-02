'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// NormalQuizModal — structured quiz assessment modal.
//
// Uses existing quiz/start and quiz/submit APIs.
// Same premium full-screen overlay style as LiveQuizModal.
// ─────────────────────────────────────────────────────────────────────────────

interface NormalQuizModalProps {
  campaignId: number;
  quizMode: 'MCQ' | 'FREE_TEXT';
  onComplete: (score: number | null) => void;
  onDismiss: () => void;
}

type Phase = 'loading' | 'quiz' | 'submitting' | 'completed' | 'error';

interface QuizQuestion {
  id: string;
  type: 'MCQ' | 'FREE_TEXT';
  questionText: string;
  options: string[] | null;
  points: number;
  difficulty: string | null;
  isFollowUp: boolean;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export default function NormalQuizModal({
  campaignId,
  quizMode,
  onComplete,
  onDismiss,
}: NormalQuizModalProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selectedIndex?: number; freeTextAnswer?: string; shownAt: string; answeredAt?: string }>>({});
  const [shuffledOrders, setShuffledOrders] = useState<Record<string, number[]>>({});
  const [score, setScore] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [freeTextAnswer, setFreeTextAnswer] = useState('');

  const questionShownRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Start quiz on mount
  useEffect(() => {
    let cancelled = false;

    async function startQuiz() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/quiz/start`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ drawCount: 5, mode: quizMode }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.code === 'ALREADY_ATTEMPTED') {
            // Quiz already taken — treat as completed with unknown score
            if (!cancelled) {
              setScore(null);
              setPhase('completed');
            }
            return;
          }
          throw new Error(data.error ?? 'Failed to start quiz');
        }

        const data = await res.json();
        if (cancelled) return;

        setAttemptId(data.attemptId);
        setQuestions(data.questions);

        // Shuffle MCQ options for each question
        const orders: Record<string, number[]> = {};
        for (const q of data.questions) {
          if (q.type === 'MCQ' && q.options) {
            const order = q.options.map((_: string, i: number) => i);
            // Fisher-Yates shuffle
            for (let i = order.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [order[i], order[j]] = [order[j], order[i]];
            }
            orders[q.id] = order;
          }
        }
        setShuffledOrders(orders);
        questionShownRef.current = new Date().toISOString();
        setPhase('quiz');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load quiz');
          setPhase('error');
        }
      }
    }

    startQuiz();
    return () => { cancelled = true; };
  }, [campaignId, quizMode]);

  const currentQ = questions[currentIdx];
  const shuffledOrder = currentQ ? (shuffledOrders[currentQ.id] ?? currentQ.options?.map((_: string, i: number) => i) ?? []) : [];

  const handleSelectOption = useCallback((displayIdx: number) => {
    if (!currentQ) return;
    setSelectedOption(displayIdx);

    // Map back to original index
    const originalIdx = shuffledOrder[displayIdx];

    const now = new Date().toISOString();
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: {
        selectedIndex: originalIdx,
        shownAt: questionShownRef.current,
        answeredAt: now,
      },
    }));

    // Auto-advance after brief delay
    setTimeout(() => {
      setSelectedOption(null);
      if (currentIdx < questions.length - 1) {
        setCurrentIdx((prev) => prev + 1);
        questionShownRef.current = new Date().toISOString();
      } else {
        // Last question — auto-submit
        submitQuiz({
          ...answers,
          [currentQ.id]: {
            selectedIndex: originalIdx,
            shownAt: questionShownRef.current,
            answeredAt: now,
          },
        });
      }
    }, 400);
  }, [currentQ, currentIdx, questions.length, shuffledOrder, answers]);

  const submitQuiz = useCallback(async (allAnswers: Record<string, { selectedIndex?: number; freeTextAnswer?: string; shownAt: string; answeredAt?: string }>) => {
    if (!attemptId) return;
    setPhase('submitting');

    const answersList = questions.map((q) => ({
      questionId: q.id,
      selectedIndex: allAnswers[q.id]?.selectedIndex,
      freeTextAnswer: allAnswers[q.id]?.freeTextAnswer,
      shownAt: allAnswers[q.id]?.shownAt ?? new Date().toISOString(),
      answeredAt: allAnswers[q.id]?.answeredAt ?? new Date().toISOString(),
    }));

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/quiz/submit`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          attemptId,
          answers: answersList,
          shuffledOrders,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to submit quiz');
      }

      const data = await res.json();
      setScore(data.totalScore ?? null);
      setCorrectCount(data.correctCount ?? 0);
      setTotalCount(questions.length);
      setPhase('completed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
      setPhase('error');
    }
  }, [attemptId, campaignId, questions, shuffledOrders]);

  const handleFreeTextContinue = useCallback(() => {
    if (!currentQ || currentQ.type !== 'FREE_TEXT') return;
    const trimmed = freeTextAnswer.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    const nextAnswers = {
      ...answers,
      [currentQ.id]: {
        freeTextAnswer: trimmed,
        shownAt: questionShownRef.current,
        answeredAt: now,
      },
    };

    setAnswers(nextAnswers);
    setFreeTextAnswer('');

    if (currentIdx < questions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      questionShownRef.current = new Date().toISOString();
      return;
    }

    submitQuiz(nextAnswers);
  }, [answers, currentIdx, currentQ, freeTextAnswer, questions.length, submitQuiz]);

  if (!mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md">
      <div className="w-full max-w-lg mx-4 max-h-[100dvh] overflow-y-auto">

        {/* ── Loading ─────────────────────────────────────────── */}
        {phase === 'loading' && (
          <div className="text-center py-20">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-white/10 border-t-green-400 animate-spin" />
            <div className="mt-4 text-[11px] font-mono text-neutral-500">Preparing your quiz assessment...</div>
          </div>
        )}

        {/* ── Quiz ────────────────────────────────────────────── */}
        {phase === 'quiz' && currentQ && (
          <div className="animate-in fade-in duration-300">
            {/* Progress */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400/80">
                {quizMode === 'FREE_TEXT' ? 'Free-Text Assessment' : 'Quiz Assessment'} · Question {currentIdx + 1} of {questions.length}
              </div>
              <div className="flex gap-1.5">
                {questions.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i < currentIdx ? 'bg-green-400' : i === currentIdx ? 'bg-white' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1 w-full rounded-full bg-white/[.06] overflow-hidden mb-8">
              <div
                className="h-full rounded-full bg-green-400 transition-all duration-500"
                style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
              />
            </div>

            {/* Question */}
            <div className="mb-8">
              <h3 className="text-lg md:text-xl font-display font-bold text-white leading-relaxed">
                {currentQ.questionText}
              </h3>
            </div>

            {/* Options */}
            {currentQ.type === 'MCQ' && currentQ.options && (
              <div className="space-y-3">
                {shuffledOrder.map((origIdx: number, displayIdx: number) => {
                  const isSelected = selectedOption === displayIdx;
                  return (
                    <button
                      key={displayIdx}
                      onClick={() => handleSelectOption(displayIdx)}
                      disabled={selectedOption !== null}
                      className={`w-full text-left rounded-xl border px-5 py-4 transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'border-green-500/60 bg-green-500/10 text-green-400 scale-[0.98]'
                          : 'border-white/[.08] bg-white/[.02] text-neutral-300 hover:border-white/20 hover:bg-white/[.04] hover:text-white'
                      } disabled:pointer-events-none`}
                    >
                      <span className="font-mono text-[11px] mr-3 text-neutral-600">
                        {String.fromCharCode(65 + displayIdx)}.
                      </span>
                      <span className="text-[13px]">{currentQ.options![origIdx]}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {currentQ.type === 'FREE_TEXT' && (
              <div>
                <textarea
                  value={freeTextAnswer}
                  onChange={(event) => setFreeTextAnswer(event.target.value)}
                  placeholder="Write your answer here..."
                  className="min-h-40 w-full rounded-2xl border border-white/[.08] bg-white/[.02] px-5 py-4 text-[13px] text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-green-500/40"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-[10px] font-mono text-neutral-600">
                    Answer in your own words. AI grading and AI-content checks run on submission.
                  </div>
                  <button
                    type="button"
                    onClick={handleFreeTextContinue}
                    disabled={freeTextAnswer.trim().length === 0}
                    className="rounded-xl bg-green-500 px-5 py-3 text-[12px] font-bold text-black transition-all hover:bg-green-400 disabled:opacity-40"
                  >
                    {currentIdx < questions.length - 1 ? 'Continue' : 'Submit'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Submitting ──────────────────────────────────────── */}
        {phase === 'submitting' && (
          <div className="text-center py-20">
            <div className="w-12 h-12 mx-auto rounded-full border-2 border-green-500/20 border-t-green-400 animate-spin" />
            <div className="mt-5 text-[12px] font-mono text-green-400">Grading your answers...</div>
          </div>
        )}

        {/* ── Completed ───────────────────────────────────────── */}
        {phase === 'completed' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-green-500/10 border-2 border-green-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-green-400/80 mb-1">Quiz Assessment Complete</div>
              <h2 className="font-display font-bold text-2xl text-white">Results</h2>
            </div>

            {score !== null && (
              <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-6 mb-6">
                <div className="text-center">
                  <div className={`text-6xl font-display font-black ${score >= 60 ? 'text-green-400' : 'text-red-400'}`}>
                    {score}
                  </div>
                  <div className={`text-[12px] font-bold mt-1 ${score >= 60 ? 'text-green-400' : 'text-red-400'}`}>
                    {score >= 60 ? 'PASSED' : 'BELOW THRESHOLD'}
                  </div>
                  {totalCount > 0 && (
                    <div className="text-[11px] text-neutral-500 mt-2">
                      {correctCount} of {totalCount} correct
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => onComplete(score)}
              className="w-full py-4 rounded-2xl bg-green-500 text-black text-[14px] font-display font-bold transition-all hover:bg-green-400 hover:shadow-[0_0_30px_rgba(34,197,94,0.3)] active:scale-[0.98]"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {phase === 'error' && (
          <div className="text-center py-16">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="text-[12px] font-mono text-red-400 mb-5">{error ?? 'Something went wrong'}</div>
            <button
              onClick={onDismiss}
              className="text-[12px] font-mono text-neutral-400 px-5 py-2.5 rounded-xl border border-white/10 hover:text-white transition-all"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
