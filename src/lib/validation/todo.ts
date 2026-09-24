import { z } from "zod";

import { ERRAND_TYPES } from "@/lib/tasks/task-kinds";
import { V } from "./messages";

/**
 * A to-do: the rest of the week, not coursework.
 *
 * Deliberately small. A to-do list that asks eight questions per item is a
 * to-do list nobody fills in, so everything except the title is optional and
 * the duration has an honest default per type.
 *
 * Times are wall-clock exactly as typed; the server converts them with the
 * student's own zone — see lib/calendar/time.ts.
 */

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const todoSchema = z
  .object({
    title: z.string().trim().min(1, V.required).max(200, V.nameTooLong),
    todoType: z.enum(ERRAND_TYPES),
    /** When it has to be done by. */
    deadlineLocal: z.string().regex(LOCAL_DATE_TIME, V.outOfRange).or(z.literal("")).nullable(),
    /** When it happens, for the things that happen at a time. */
    fixedStartLocal: z.string().regex(LOCAL_DATE_TIME, V.outOfRange).or(z.literal("")).nullable(),
    /** Null means "use the default for this type" rather than "no time at all". */
    estimatedMinutes: z.number().int().min(0, V.outOfRange).max(1440, V.outOfRange).nullable(),
  })
  .refine(
    // An appointment at a set time is not also due at another time; one of them
    // would silently win, and the student could not tell which.
    (value) => !(value.fixedStartLocal && value.deadlineLocal),
    { message: V.outOfRange, path: ["deadlineLocal"] },
  );

export type TodoInput = z.infer<typeof todoSchema>;

export const defaultTodoInput: TodoInput = {
  title: "",
  todoType: "admin",
  deadlineLocal: null,
  fixedStartLocal: null,
  estimatedMinutes: null,
};
