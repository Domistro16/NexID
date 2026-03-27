"use client";

import { useState } from "react";
import { useAdminFetch } from "./useAdminFetch";
import type { QuestionRow } from "./types";

interface Props {
  campaignId: number;
  questions: QuestionRow[];
  onRefresh: () => void;
}

interface NewQuestion {
  type: "MCQ" | "FREE_TEXT";
  questionText: string;
  options: string[];
  correctIndex: number;
  gradingRubric: string;
  points: number;
  difficulty: number;
  isSpeedTrap: boolean;
  speedTrapWindow: number;
}

function emptyQuestion(): NewQuestion {
  return {
    type: "MCQ",
    questionText: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    gradingRubric: "",
    points: 10,
    difficulty: 2,
    isSpeedTrap: false,
    speedTrapWindow: 10,
  };
}

export default function QuestionEditor({ campaignId, questions, onRefresh }: Props) {
  const { authFetch } = useAdminFetch();
  const [showAdd, setShowAdd] = useState(false);
  const [newQ, setNewQ] = useState<NewQuestion>(emptyQuestion());
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState<NewQuestion>(emptyQuestion());
  const [filter, setFilter] = useState<"all" | "MCQ" | "FREE_TEXT">("all");

  const filtered = filter === "all" ? questions : questions.filter((q) => q.type === filter);
  const mcqCount = questions.filter((q) => q.type === "MCQ").length;
  const ftCount = questions.filter((q) => q.type === "FREE_TEXT").length;
  const trapCount = questions.filter((q) => q.isSpeedTrap).length;

  const addQuestion = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        type: newQ.type,
        questionText: newQ.questionText,
        points: newQ.points,
        difficulty: newQ.difficulty,
        isSpeedTrap: newQ.isSpeedTrap,
        speedTrapWindow: newQ.isSpeedTrap ? newQ.speedTrapWindow : null,
      };
      if (newQ.type === "MCQ") {
        payload.options = newQ.options.filter(Boolean);
        payload.correctIndex = newQ.correctIndex;
      } else {
        payload.gradingRubric = newQ.gradingRubric;
      }

      const res = await authFetch(`/api/admin/campaigns/${campaignId}/questions`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setNewQ(emptyQuestion());
        setShowAdd(false);
        onRefresh();
      }
    } catch {
      /* handled */
    } finally {
      setSaving(false);
    }
  };

  const updateQuestion = async (id: string) => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        questionId: id,
        type: editQ.type,
        questionText: editQ.questionText,
        points: editQ.points,
        difficulty: editQ.difficulty,
        isSpeedTrap: editQ.isSpeedTrap,
        speedTrapWindow: editQ.isSpeedTrap ? editQ.speedTrapWindow : null,
      };
      if (editQ.type === "MCQ") {
        payload.options = editQ.options.filter(Boolean);
        payload.correctIndex = editQ.correctIndex;
      } else {
        payload.gradingRubric = editQ.gradingRubric;
      }

      const res = await authFetch(`/api/admin/campaigns/${campaignId}/questions`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setEditingId(null);
        onRefresh();
      }
    } catch {
      /* handled */
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    try {
      await authFetch(`/api/admin/campaigns/${campaignId}/questions?questionId=${id}`, {
        method: "DELETE",
      });
      onRefresh();
    } catch {
      /* handled */
    }
  };

  const startEdit = (q: QuestionRow) => {
    setEditingId(q.id);
    setEditQ({
      type: q.type,
      questionText: q.questionText,
      options: q.type === "MCQ" && Array.isArray(q.options) ? [...q.options] : ["", "", "", ""],
      correctIndex: q.correctIndex ?? 0,
      gradingRubric: q.gradingRubric ?? "",
      points: q.points,
      difficulty: q.difficulty,
      isSpeedTrap: q.isSpeedTrap,
      speedTrapWindow: q.speedTrapWindow ?? 10,
    });
  };

  return (
    <div>
      {/* Stats bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="grid grid-cols-4 gap-2 flex-1">
          {[
            { label: "Total", value: questions.length, color: "text-white" },
            { label: "MCQ", value: mcqCount, color: "text-blue-400" },
            { label: "Free Text", value: ftCount, color: "text-purple-400" },
            { label: "Speed Traps", value: trapCount, color: "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="bg-[#0a0a0a] border border-white/[.06] rounded-lg px-2.5 py-2">
              <div className="text-[9px] font-mono uppercase text-neutral-500 mb-0.5">{s.label}</div>
              <div className={`font-mono font-bold text-sm ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setShowAdd(true); setNewQ(emptyQuestion()); }}
          className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:border-white/20 hover:text-white transition-colors shrink-0"
        >
          + Add Question
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5 mb-3">
        {(["all", "MCQ", "FREE_TEXT"] as const).map((f) => {
          const labels = { all: "All", MCQ: "MCQ", FREE_TEXT: "Free Text" };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-all ${
                filter === f
                  ? "bg-nexid-gold text-black border-nexid-gold font-bold"
                  : "bg-transparent text-neutral-400 border-white/10 hover:text-white"
              }`}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Add question form */}
      {showAdd && (
        <div className="bg-[#060606] border border-nexid-gold/30 rounded-xl p-4 mb-3">
          <div className="text-[9px] font-mono uppercase text-nexid-gold/60 mb-3">New Question</div>
          <QuestionForm
            q={newQ}
            onChange={setNewQ}
            onSave={addQuestion}
            onCancel={() => setShowAdd(false)}
            saving={saving}
            saveLabel="Add Question"
          />
        </div>
      )}

      {/* Question list */}
      {filtered.length === 0 && !showAdd ? (
        <div className="text-center py-8 text-neutral-500 text-xs font-mono">No questions yet. Add your first question above.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((q, idx) => (
            <div key={q.id} className="bg-[#0a0a0a] border border-white/[.06] rounded-xl p-3 relative">
              {editingId === q.id ? (
                <>
                  <div className="text-[9px] font-mono text-neutral-500 mb-2">Editing Question {idx + 1}</div>
                  <QuestionForm
                    q={editQ}
                    onChange={setEditQ}
                    onSave={() => updateQuestion(q.id)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                    saveLabel="Save Changes"
                  />
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="text-[9px] font-mono text-neutral-500 mb-1">
                        Question {idx + 1} ·{" "}
                        <span className={q.type === "FREE_TEXT" ? "text-purple-400" : "text-blue-400"}>
                          {q.type === "FREE_TEXT" ? "Free text" : "Multiple choice"}
                        </span>
                        {q.isSpeedTrap && <span className="text-amber-400 ml-1">· ⚡ Speed Trap</span>}
                        <span className="text-neutral-600 ml-1">· {q.points}pts · Diff {q.difficulty}</span>
                      </div>
                      <div className="text-[12px] text-white font-medium mb-2">{q.questionText}</div>

                      {q.type === "MCQ" && Array.isArray(q.options) && (
                        <div className="space-y-1">
                          {q.options.map((opt, j) => (
                            <div
                              key={j}
                              className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded border ${
                                j === q.correctIndex
                                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                                  : "border-white/[.06] text-neutral-500"
                              }`}
                            >
                              <span className="font-mono text-[9px]">{String.fromCharCode(65 + j)}</span>
                              {opt}
                              {j === q.correctIndex && <span className="ml-auto font-mono text-[9px]">✓ Correct</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {q.type === "FREE_TEXT" && q.gradingRubric && (
                        <div className="text-[11px] font-mono text-neutral-500 bg-[#0f0f0f] border border-white/[.06] rounded p-2 mt-1">
                          Rubric: {q.gradingRubric}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(q)}
                        className="text-[10px] font-mono text-neutral-400 px-2 py-0.5 rounded border border-white/10 hover:text-white transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteQuestion(q.id)}
                        className="text-[10px] font-mono text-red-400 px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Question form (used for add + edit) ── */

function QuestionForm({ q, onChange, onSave, onCancel, saving, saveLabel }: {
  q: NewQuestion;
  onChange: (q: NewQuestion) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  const update = <K extends keyof NewQuestion>(key: K, value: NewQuestion[K]) => {
    onChange({ ...q, [key]: value });
  };

  return (
    <div>
      {/* Type toggle */}
      <div className="flex gap-1.5 mb-3">
        <button
          onClick={() => update("type", "MCQ")}
          className={`text-[10px] font-mono px-2.5 py-1 rounded border transition-all ${
            q.type === "MCQ"
              ? "bg-nexid-gold text-black border-nexid-gold font-bold"
              : "bg-transparent text-neutral-400 border-white/10"
          }`}
        >
          Multiple Choice
        </button>
        <button
          onClick={() => update("type", "FREE_TEXT")}
          className={`text-[10px] font-mono px-2.5 py-1 rounded border transition-all ${
            q.type === "FREE_TEXT"
              ? "bg-nexid-gold text-black border-nexid-gold font-bold"
              : "bg-transparent text-neutral-400 border-white/10"
          }`}
        >
          Free Text (AI graded)
        </button>
      </div>

      {/* Question text */}
      <input
        type="text"
        value={q.questionText}
        onChange={(e) => update("questionText", e.target.value)}
        placeholder="Question text"
        className="w-full bg-[#0f0f0f] border border-white/[.06] rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-nexid-gold/40 placeholder:text-neutral-600 mb-3"
      />

      {/* MCQ options */}
      {q.type === "MCQ" && (
        <div className="space-y-1.5 mb-3">
          {q.options.map((opt, j) => (
            <div key={j} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct-option"
                checked={q.correctIndex === j}
                onChange={() => update("correctIndex", j)}
                className="accent-green-400"
              />
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const opts = [...q.options];
                  opts[j] = e.target.value;
                  update("options", opts);
                }}
                placeholder={`Option ${String.fromCharCode(65 + j)}`}
                className={`flex-1 bg-[#0f0f0f] border rounded-md px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-nexid-gold/40 placeholder:text-neutral-600 ${
                  q.correctIndex === j ? "border-green-500/30" : "border-white/[.06]"
                }`}
              />
              {q.correctIndex === j && <span className="text-[9px] font-mono text-green-400">✓ Correct</span>}
            </div>
          ))}
          {q.options.length < 6 && (
            <button
              onClick={() => update("options", [...q.options, ""])}
              className="text-[10px] font-mono text-neutral-500 hover:text-white transition-colors"
            >
              + Add option
            </button>
          )}
        </div>
      )}

      {/* Free text rubric */}
      {q.type === "FREE_TEXT" && (
        <div className="mb-3">
          <div className="text-[11px] font-mono text-neutral-500 bg-[#0f0f0f] border border-white/[.06] rounded-t-lg px-3 py-2">
            AI semantic grading. Provide an ideal answer as reference:
          </div>
          <textarea
            rows={2}
            value={q.gradingRubric}
            onChange={(e) => update("gradingRubric", e.target.value)}
            placeholder="Ideal answer reference (for AI calibration)"
            className="w-full bg-[#0f0f0f] border border-t-0 border-white/[.06] rounded-b-lg px-3 py-2 text-[11px] text-white outline-none focus:border-nexid-gold/40 placeholder:text-neutral-600 resize-none"
          />
        </div>
      )}

      {/* Points + difficulty + speed trap */}
      <div className="flex gap-3 mb-3">
        <div>
          <label className="block text-[9px] font-mono uppercase text-neutral-500 mb-1">Points</label>
          <input
            type="number"
            value={q.points}
            onChange={(e) => update("points", Number(e.target.value) || 10)}
            className="w-20 bg-[#0f0f0f] border border-white/[.06] rounded px-2 py-1 text-[11px] text-white font-mono outline-none focus:border-nexid-gold/40"
          />
        </div>
        <div>
          <label className="block text-[9px] font-mono uppercase text-neutral-500 mb-1">Difficulty (1-3)</label>
          <input
            type="number"
            min={1}
            max={3}
            value={q.difficulty}
            onChange={(e) => update("difficulty", Math.min(3, Math.max(1, Number(e.target.value) || 1)))}
            className="w-20 bg-[#0f0f0f] border border-white/[.06] rounded px-2 py-1 text-[11px] text-white font-mono outline-none focus:border-nexid-gold/40"
          />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={q.isSpeedTrap}
              onChange={(e) => update("isSpeedTrap", e.target.checked)}
              className="accent-amber-400"
            />
            <span className="text-[10px] font-mono text-amber-400">⚡ Speed Trap</span>
          </label>
          {q.isSpeedTrap && (
            <input
              type="number"
              value={q.speedTrapWindow}
              onChange={(e) => update("speedTrapWindow", Number(e.target.value) || 10)}
              className="w-16 bg-[#0f0f0f] border border-white/[.06] rounded px-2 py-1 text-[11px] text-white font-mono outline-none"
              placeholder="sec"
            />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving || !q.questionText}
          className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg bg-nexid-gold text-black border border-nexid-gold hover:bg-yellow-400 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="text-[11px] font-display font-bold px-3 py-1.5 rounded-lg border border-white/10 text-neutral-300 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
