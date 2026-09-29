import type { NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { nowIso } from "@/server/clock";
import { dispatchNotifications } from "@/server/notification-dispatch-service";

/**
 * Invoked by a scheduler (`vercel.json`'s `crons`), never by a signed-in
 * browser — there is deliberately no `requireUserContext()` here.
 * **`GET`, not `POST`**: Vercel Cron Jobs make a `GET` request to the
 * configured path, automatically attaching `Authorization: Bearer
 * $CRON_SECRET` whenever that env var is set on the project — this handler
 * only has to check it matches, not construct the header itself.
 *
 * `CRON_SECRET` unset means this route refuses every request — the correct
 * failure mode for an environment that hasn't wired up the cron yet, rather
 * than an open, unauthenticated dispatch endpoint.
 */
export async function GET(request: NextRequest) {
  const { CRON_SECRET } = getServerEnv();

  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await dispatchNotifications(nowIso());
  return Response.json(result);
}
