import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InstitutionRow, ProgramRow } from "@/lib/supabase/types";
import type { InstitutionInput, ProgramInput } from "@/lib/validation/academic";

/**
 * Institutions and degree programs.
 *
 * Every query filters on user_id explicitly even though Row Level Security
 * already does. Belt and braces: if a policy is ever loosened by mistake, these
 * queries still only touch the caller's own rows.
 */

export async function listInstitutions(userId: string): Promise<InstitutionRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("institutions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load institutions: ${error.message}`);
  return data ?? [];
}

export async function createInstitution(
  userId: string,
  input: InstitutionInput,
): Promise<InstitutionRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("institutions")
    .insert({ user_id: userId, name: input.name, type: input.type })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save institution: ${error.message}`);
  return data;
}

export async function listPrograms(userId: string): Promise<ProgramRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load programs: ${error.message}`);
  return data ?? [];
}

export async function createProgram(userId: string, input: ProgramInput): Promise<ProgramRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("programs")
    .insert({
      user_id: userId,
      name: input.name,
      institution_id: input.institutionId,
      start_date: input.startDate,
      end_date: input.endDate,
      color: input.color,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save program: ${error.message}`);
  return data;
}

export async function updateProgram(
  userId: string,
  programId: string,
  input: ProgramInput,
): Promise<ProgramRow> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("programs")
    .update({
      name: input.name,
      institution_id: input.institutionId,
      start_date: input.startDate,
      end_date: input.endDate,
      color: input.color,
    })
    .eq("id", programId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not update program: ${error.message}`);
  return data;
}

export async function deleteProgram(userId: string, programId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("programs")
    .delete()
    .eq("id", programId)
    .eq("user_id", userId);

  if (error) throw new Error(`Could not delete program: ${error.message}`);
}
