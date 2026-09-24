import { exportAccountData } from "@/server/account-service";
import { requireUser } from "@/server/auth";
import { nowIso } from "@/server/clock";

/**
 * A copy of everything this account holds, as JSON.
 *
 * A route handler rather than a Server Action for the same reason as the
 * calendar exports: the browser has to receive it as a download, and an Action
 * returns values to JavaScript.
 */
export async function GET() {
  const user = await requireUser();
  const stamp = nowIso();

  const payload = await exportAccountData(user.id, user.email ?? null, stamp);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="study-planner-data-${stamp.slice(0, 10)}.json"`,
      // A file containing every last thing about one student must never sit in
      // a shared cache.
      "cache-control": "no-store, private",
    },
  });
}
