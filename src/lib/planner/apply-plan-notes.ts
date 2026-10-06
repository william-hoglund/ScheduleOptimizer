import type { PlanNotesInterpretation } from "@/lib/ai/schemas/plan-notes";
import { localToEpochMinutes } from "./time-grid";
import type { AppliedPlanNote, PlannerFixedEvent, PlannerInput } from "./types";

/**
 * Applies an interpreted planning note to the engine's input — as hard rules,
 * using machinery the engine already honours:
 *
 *   - an unavailable day range becomes one fixed, all-day-spanning block, so
 *     availability simply has no windows there;
 *   - a finish-by date tightens that task's deadline (never loosens it).
 *
 * Everything the model said is re-checked here: dates must exist in the
 * student's timezone, ranges must run forwards, and a task id must be one of
 * the tasks actually being planned. Anything that fails is dropped and
 * reported, not guessed at.
 */

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function applyPlanNotes(
  input: PlannerInput,
  notes: PlanNotesInterpretation,
): { input: PlannerInput; applied: AppliedPlanNote[]; rejected: string[] } {
  const applied: AppliedPlanNote[] = [];
  const rejected: string[] = [...notes.notUnderstood];
  const blocks: PlannerFixedEvent[] = [];

  for (const [index, range] of notes.unavailable.entries()) {
    const start = localToEpochMinutes(range.startDate, "00:00", input.timeZone);
    const end = localToEpochMinutes(addDays(range.endDate, 1), "00:00", input.timeZone);
    if (start === null || end === null || end <= start) {
      rejected.push(range.label);
      continue;
    }
    blocks.push({ id: `plan-note-away-${index}`, start, end, isFixed: true, courseId: null, sourceId: null });
    applied.push({ kind: "unavailable", label: range.label, startDate: range.startDate, endDate: range.endDate });
  }

  const finishByTask = new Map<string, number>();
  for (const item of notes.finishBy) {
    const task = input.tasks.find((candidate) => candidate.id === item.taskId);
    // End of that day: work may happen on it, not after.
    const cutoff = localToEpochMinutes(addDays(item.date, 1), "00:00", input.timeZone);
    if (!task || cutoff === null) {
      rejected.push(item.label);
      continue;
    }
    finishByTask.set(task.id, Math.min(cutoff, finishByTask.get(task.id) ?? cutoff));
    applied.push({ kind: "finishBy", label: item.label, taskTitle: task.title, date: item.date });
  }

  return {
    input: {
      ...input,
      fixedEvents: [...input.fixedEvents, ...blocks],
      tasks: input.tasks.map((task) => {
        const cutoff = finishByTask.get(task.id);
        if (cutoff === undefined) return task;
        return { ...task, deadline: task.deadline === null ? cutoff : Math.min(task.deadline, cutoff) };
      }),
    },
    applied,
    rejected,
  };
}
