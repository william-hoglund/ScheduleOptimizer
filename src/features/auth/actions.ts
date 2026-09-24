"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";

import { clientEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createForgotPasswordSchema,
  createLoginSchema,
  createRegisterSchema,
  createResetPasswordSchema,
  defaultAuthMessages,
  type AuthActionResult,
  type AuthErrorCode,
} from "@/lib/validation/auth";

/**
 * Server actions for authentication.
 *
 * Every one re-validates its input regardless of what the client checked, and
 * returns an error *code* rather than a message so the UI can translate it.
 */

/**
 * Maps Supabase's error strings onto our own codes.
 *
 * Deliberately coarse for sign-in: whether the email exists or the password was
 * wrong both become `invalid_credentials`, so the form cannot be used to
 * discover which addresses have accounts.
 */
function toErrorCode(error: AuthError): AuthErrorCode {
  const message = error.message.toLowerCase();

  if (error.status === 429 || message.includes("rate limit")) return "rate_limited";
  if (message.includes("invalid login credentials")) return "invalid_credentials";
  if (message.includes("email not confirmed")) return "email_not_confirmed";
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "email_taken";
  }
  if (message.includes("password") && message.includes("least")) return "weak_password";
  if (message.includes("expired") || message.includes("invalid")) return "expired_link";

  return "unknown";
}

export async function signIn(formData: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const parsed = createLoginSchema(defaultAuthMessages).safeParse(formData);
  if (!parsed.success) {
    return { ok: false, code: "invalid_input" };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, code: toErrorCode(error) };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signUp(formData: {
  fullName: string;
  email: string;
  password: string;
  timezone?: string;
  locale?: string;
}): Promise<AuthActionResult & { needsConfirmation?: boolean }> {
  const parsed = createRegisterSchema(defaultAuthMessages).safeParse(formData);
  if (!parsed.success) {
    return { ok: false, code: "invalid_input" };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the handle_new_user() trigger to populate the profile row.
      data: {
        full_name: parsed.data.fullName,
        timezone: formData.timezone ?? "Europe/Stockholm",
        locale: formData.locale ?? "en",
      },
      emailRedirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    return { ok: false, code: toErrorCode(error) };
  }

  revalidatePath("/", "layout");

  // With email confirmation switched on there is no session yet, so the form
  // shows "check your inbox". With it off, Supabase signs them straight in and
  // the form can send them into onboarding.
  return { ok: true, needsConfirmation: data.session === null };
}

export async function requestPasswordReset(formData: { email: string }): Promise<AuthActionResult> {
  const parsed = createForgotPasswordSchema(defaultAuthMessages).safeParse(formData);
  if (!parsed.success) {
    return { ok: false, code: "invalid_input" };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  // Rate limiting is worth surfacing; anything else is not. The UI always says
  // "if that address has an account, we sent a link", so a stranger cannot use
  // this form to find out who is registered.
  if (error && error.status === 429) {
    return { ok: false, code: "rate_limited" };
  }

  return { ok: true };
}

export async function updatePassword(formData: {
  password: string;
  confirmPassword: string;
}): Promise<AuthActionResult> {
  const parsed = createResetPasswordSchema(defaultAuthMessages).safeParse(formData);
  if (!parsed.success) {
    return { ok: false, code: "invalid_input" };
  }

  const supabase = await createServerSupabaseClient();

  // The recovery link signs the user in temporarily; without that session there
  // is nobody to update.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, code: "expired_link" };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { ok: false, code: toErrorCode(error) };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signOut(): Promise<never> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
