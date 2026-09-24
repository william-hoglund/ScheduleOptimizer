"use server";

import { revalidatePath } from "next/cache";

import { toCalendarEventDto, type CalendarEventDto } from "./event-dto";
import { calendarEventSchema } from "@/lib/validation/calendar-event";
import { actionOk, fromZodError, guarded, type ActionResult } from "@/lib/validation/action-result";
import { requireUserContext } from "@/server/auth";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  moveCalendarEvent,
  updateCalendarEvent,
} from "@/server/calendar-service";

/**
 * Events overlapping a visible range.
 *
 * Called whenever the student navigates to a different week or month, so the
 * calendar never silently hides events that fall outside whatever window
 * happened to be loaded first.
 */
export async function fetchEventsInRange(
  startIso: string,
  endIso: string,
): Promise<ActionResult<CalendarEventDto[]>> {
  const { user } = await requireUserContext();

  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "invalidInput" };
  }

  return guarded(async () => {
    const rows = await listCalendarEvents(user.id, start.toISOString(), end.toISOString());
    return rows.map(toCalendarEventDto);
  });
}

export async function saveCalendarEvent(
  input: unknown,
  eventId?: string,
): Promise<ActionResult<{ id: string }>> {
  const { user, timeZone } = await requireUserContext();

  const parsed = calendarEventSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await guarded(async () =>
    eventId
      ? await updateCalendarEvent(user.id, eventId, parsed.data, timeZone)
      : await createCalendarEvent(user.id, parsed.data, timeZone),
  );
  if (!result.ok) return result;

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return actionOk({ id: result.data.id });
}

/**
 * Drag to move or resize.
 *
 * FullCalendar hands back absolute instants, so there is no wall-clock
 * conversion to do — but they are still validated as real dates in the right
 * order before touching the database.
 */
export async function moveEvent(
  eventId: string,
  startIso: string,
  endIso: string,
): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const start = new Date(startIso);
  const end = new Date(endIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: "invalidInput" };
  }

  const result = await guarded(() =>
    moveCalendarEvent(user.id, eventId, start.toISOString(), end.toISOString()),
  );
  if (!result.ok) return result;

  revalidatePath("/calendar");
  return actionOk();
}

export async function removeCalendarEvent(eventId: string): Promise<ActionResult<undefined>> {
  const { user } = await requireUserContext();

  const result = await guarded(() => deleteCalendarEvent(user.id, eventId));
  if (!result.ok) return result;

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return actionOk();
}
