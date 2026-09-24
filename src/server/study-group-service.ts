import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Study groups.
 *
 * Ranked on plan adherence — how much of your *own* plan you kept — never on
 * hours studied and never on grades. See docs/PLAN.md §5b for why.
 */

export type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  joinCode: string;
  weeklySessionGoal: number;
  isOwner: boolean;
  memberCount: number;
};

export type BoardEntry = {
  userId: string;
  displayName: string;
  isYou: boolean;
  adherencePercent: number;
  sessionsCompleted: number;
  completedMinutes: number;
  streakDays: number;
  isPaused: boolean;
};

export type GroupBoard = {
  group: GroupSummary;
  periodStart: string;
  entries: BoardEntry[];
  /** Sessions the group has completed together, against its goal. */
  goalCompleted: number;
  goalTotal: number;
};

/** Unambiguous characters only: no O/0 or I/1 to mistype when sharing a code. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 7; i += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Monday of the week containing the given date, as "YYYY-MM-DD". */
export function weekStart(dateIso: string): string {
  const date = new Date(dateIso);
  const day = date.getUTCDay();
  const isoDay = day === 0 ? 7 : day;
  return new Date(date.getTime() - (isoDay - 1) * 86_400_000).toISOString().slice(0, 10);
}

export async function listMyGroups(userId: string): Promise<GroupSummary[]> {
  const supabase = await createServerSupabaseClient();

  // Two plain queries rather than an embedded join: PostgREST can express the
  // relationship, but the generated types cannot, and the clarity is worth more
  // than the round trip.
  const { data: memberships, error } = await supabase
    .from("study_group_members")
    .select("group_id")
    .eq("user_id", userId);

  if (error) throw new Error(`Could not load your groups: ${error.message}`);
  if (!memberships || memberships.length === 0) return [];

  const { data: groups, error: groupsError } = await supabase
    .from("study_groups")
    .select("id, name, description, join_code, weekly_session_goal, owner_id")
    .in(
      "id",
      memberships.map((membership) => membership.group_id),
    );

  if (groupsError) throw new Error(`Could not load your groups: ${groupsError.message}`);
  if (!groups || groups.length === 0) return [];

  const { data: counts } = await supabase
    .from("study_group_members")
    .select("group_id")
    .in(
      "group_id",
      groups.map((group) => group.id),
    )
    .eq("status", "active");

  const countByGroup = new Map<string, number>();
  for (const row of counts ?? []) {
    countByGroup.set(row.group_id, (countByGroup.get(row.group_id) ?? 0) + 1);
  }

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    joinCode: group.join_code,
    weeklySessionGoal: group.weekly_session_goal,
    isOwner: group.owner_id === userId,
    memberCount: countByGroup.get(group.id) ?? 1,
  }));
}

export async function createGroup(
  userId: string,
  { name, weeklySessionGoal }: { name: string; weeklySessionGoal: number },
): Promise<{ groupId: string; joinCode: string }> {
  const supabase = await createServerSupabaseClient();

  // Collisions are vanishingly unlikely with a 7-character alphabet of 32, but
  // the column is unique so a retry is cheaper than an error page.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = generateJoinCode();

    const { data, error } = await supabase
      .from("study_groups")
      .insert({
        owner_id: userId,
        name,
        join_code: joinCode,
        weekly_session_goal: weeklySessionGoal,
      })
      .select("id, join_code")
      .single();

    if (error) {
      if (error.code === "23505") continue; // unique violation — try another code
      throw new Error(`Could not create the group: ${error.message}`);
    }

    const { error: memberError } = await supabase.from("study_group_members").insert({
      group_id: data.id,
      user_id: userId,
      role: "owner",
    });

    if (memberError) throw new Error(`Could not join your own group: ${memberError.message}`);

    return { groupId: data.id, joinCode: data.join_code };
  }

  throw new Error("Could not generate a unique join code. Please try again.");
}

/**
 * Joins by code.
 *
 * The lookup runs with the caller's own permissions, and `study_groups` is only
 * readable by members — so a plain select would find nothing. Resolving the code
 * is therefore done through a security-definer function, which returns the id
 * and nothing else: a wrong code reveals no information about whether a group
 * exists.
 */
export async function joinGroupByCode(
  userId: string,
  joinCode: string,
): Promise<{ groupId: string } | null> {
  const supabase = await createServerSupabaseClient();

  const { data: groupId, error } = await supabase.rpc("resolve_join_code", {
    code: joinCode.trim().toUpperCase(),
  });

  if (error) throw new Error(`Could not look up that code: ${error.message}`);
  if (!groupId) return null;

  const { error: joinError } = await supabase
    .from("study_group_members")
    .upsert(
      { group_id: groupId, user_id: userId, role: "member" },
      { onConflict: "group_id,user_id" },
    );

  if (joinError) throw new Error(`Could not join the group: ${joinError.message}`);

  return { groupId };
}

export async function leaveGroup(userId: string, groupId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("study_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not leave the group: ${error.message}`);
}

export async function setMembershipStatus(
  userId: string,
  groupId: string,
  status: "active" | "paused",
): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("study_group_members")
    .update({ status })
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not update your membership: ${error.message}`);
}

export async function loadBoard(
  userId: string,
  groupId: string,
  nowIso: string,
): Promise<GroupBoard | null> {
  const supabase = await createServerSupabaseClient();

  const { data: group, error } = await supabase
    .from("study_groups")
    .select("id, name, description, join_code, weekly_session_goal, owner_id")
    .eq("id", groupId)
    .maybeSingle();

  if (error) throw new Error(`Could not load the group: ${error.message}`);
  if (!group) return null;

  const periodStart = weekStart(nowIso);

  const [membersResult, scoresResult] = await Promise.all([
    supabase
      .from("study_group_members")
      .select("user_id, display_name, status, role")
      .eq("group_id", groupId),
    supabase
      .from("study_group_scores")
      .select(
        "user_id, adherence_percent, sessions_completed, completed_minutes, current_streak_days",
      )
      .eq("group_id", groupId)
      .eq("period_start", periodStart),
  ]);

  if (membersResult.error)
    throw new Error(`Could not load members: ${membersResult.error.message}`);

  const scoreByUser = new Map((scoresResult.data ?? []).map((score) => [score.user_id, score]));

  const entries: BoardEntry[] = (membersResult.data ?? []).map((member) => {
    const score = scoreByUser.get(member.user_id);
    return {
      userId: member.user_id,
      // Members who have not set a name stay anonymous to the group rather than
      // having their email exposed.
      displayName: member.display_name ?? "—",
      isYou: member.user_id === userId,
      adherencePercent: score?.adherence_percent ?? 0,
      sessionsCompleted: score?.sessions_completed ?? 0,
      completedMinutes: score?.completed_minutes ?? 0,
      streakDays: score?.current_streak_days ?? 0,
      isPaused: member.status === "paused",
    };
  });

  // Paused members drop to the bottom rather than disappearing, so the group
  // still knows they exist.
  entries.sort((a, b) => {
    if (a.isPaused !== b.isPaused) return a.isPaused ? 1 : -1;
    return b.adherencePercent - a.adherencePercent;
  });

  const goalCompleted = entries.reduce((sum, entry) => sum + entry.sessionsCompleted, 0);

  return {
    group: {
      id: group.id,
      name: group.name,
      description: group.description,
      joinCode: group.join_code,
      weeklySessionGoal: group.weekly_session_goal,
      isOwner: group.owner_id === userId,
      memberCount: entries.filter((entry) => !entry.isPaused).length,
    },
    periodStart,
    entries,
    goalCompleted,
    goalTotal: group.weekly_session_goal,
  };
}

/**
 * Recomputes the student's own score for this week, in every group they belong to.
 *
 * The work happens inside a database function, not here. `study_group_scores`
 * has no insert policy at all, so the only way a row appears is through that
 * function — which derives the numbers from the caller's own sessions rather
 * than accepting them as arguments.
 *
 * That distinction is the whole security model: a leaderboard whose scores the
 * client can supply is one anyone can forge.
 */
export async function refreshMyScores(): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("refresh_my_group_scores");

  if (error) {
    // A stale score must not stop the board rendering.
    console.error("[groups] could not refresh scores:", error.message);
  }
}
