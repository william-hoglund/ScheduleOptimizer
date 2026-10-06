import { z } from "zod";

import { V } from "./messages";

/**
 * Tasks: assignments, exams, readings and their subtasks.
 *
 * `deadlineLocal` is wall-clock ("YYYY-MM-DDTHH:MM") exactly as typed. The
 * server converts it to a UTC instant using the student's own timezone — see
 * lib/calendar/time.ts. Storing what they typed and converting once, server
 * side, is what stops a deadline drifting by an hour twice a year.
 */

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const TASK_TYPES = [
  "assignment",
  "exam",
  "reading",
  "project",
  "lab",
  "presentation",
  "revision",
  "other",
] as const;

export const TASK_STATUSES = ["not_started", "in_progress", "completed", "cancelled"] as const;

export const STUDY_METHODS = [
  "pomodoro",
  "active_recall",
  "spaced_repetition",
  "deep_work",
  "interleaving",
  "group_work",
] as const;

export const taskSchema = z.object({
  title: z.string().trim().min(1, V.required).max(200, V.nameTooLong),
  courseId: z.uuid().or(z.literal("")).nullable(),
  parentTaskId: z.uuid().or(z.literal("")).nullable(),
  description: z.string().trim().max(2000, V.tooLong).nullable(),
  taskType: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  priority: z.number().int().min(1, V.outOfRange).max(5, V.outOfRange),
  difficulty: z.number().int().min(1, V.outOfRange).max(5, V.outOfRange),
  deadlineLocal: z.string().regex(LOCAL_DATE_TIME, V.outOfRange).or(z.literal("")).nullable(),
  // 0 is allowed: a task can exist before its size is known.
  estimatedMinutes: z.number().int().min(0, V.outOfRange).max(100_000, V.outOfRange),
  completedMinutes: z.number().int().min(0, V.outOfRange).max(100_000, V.outOfRange),
  preferredStudyMethod: z.enum(STUDY_METHODS).or(z.literal("")).nullable(),
  // Null means "use the account's usual session length" — see migration
  // 0014's own comment for why this follows the same convention as a null
  // estimate rather than treating null as zero.
  preferredSessionMinutes: z.number().int().min(15, V.outOfRange).max(480, V.outOfRange).nullable(),
  // "Don't plan this before…" — a local date, e.g. revision for a December exam.
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, V.outOfRange).or(z.literal("")).nullable(),
});

export type TaskInput = z.infer<typeof taskSchema>;

export const defaultTaskInput: TaskInput = {
  title: "",
  courseId: null,
  parentTaskId: null,
  description: null,
  taskType: "assignment",
  status: "not_started",
  priority: 3,
  difficulty: 3,
  deadlineLocal: null,
  estimatedMinutes: 120,
  completedMinutes: 0,
  preferredStudyMethod: null,
  preferredSessionMinutes: null,
  startDate: null,
};

/** Marking progress from a list row, without opening the whole form. */
export const taskProgressSchema = z.object({
  status: z.enum(TASK_STATUSES),
  completedMinutes: z.number().int().min(0).max(100_000),
});
