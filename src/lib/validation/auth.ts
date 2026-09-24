import { z } from "zod";

/**
 * Authentication schemas.
 *
 * Built by a factory taking the validation messages, so the same shape can be
 * used with translated text on the client and plain English on the server. The
 * server always re-validates — client validation is a courtesy, not a control.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type AuthValidationMessages = {
  emailInvalid: string;
  passwordTooShort: string;
  passwordsDoNotMatch: string;
  nameRequired: string;
};

/** Used server-side, and as the fallback if a translation is missing. */
export const defaultAuthMessages: AuthValidationMessages = {
  emailInvalid: "Enter a valid email address.",
  passwordTooShort: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  passwordsDoNotMatch: "The two passwords do not match.",
  nameRequired: "Enter your name.",
};

export function createLoginSchema(m: AuthValidationMessages) {
  return z.object({
    email: z.email({ message: m.emailInvalid }),
    // Deliberately not length-checked on sign-in: an existing password that
    // predates a rule change must still work, and the real check is the server's.
    password: z.string().min(1, { message: m.passwordTooShort }),
  });
}

export function createRegisterSchema(m: AuthValidationMessages) {
  return z.object({
    fullName: z.string().trim().min(1, { message: m.nameRequired }).max(120),
    email: z.email({ message: m.emailInvalid }),
    password: z.string().min(PASSWORD_MIN_LENGTH, { message: m.passwordTooShort }),
  });
}

export function createForgotPasswordSchema(m: AuthValidationMessages) {
  return z.object({
    email: z.email({ message: m.emailInvalid }),
  });
}

export function createResetPasswordSchema(m: AuthValidationMessages) {
  return z
    .object({
      password: z.string().min(PASSWORD_MIN_LENGTH, { message: m.passwordTooShort }),
      confirmPassword: z.string(),
    })
    .refine((values) => values.password === values.confirmPassword, {
      message: m.passwordsDoNotMatch,
      path: ["confirmPassword"],
    });
}

export type LoginInput = z.infer<ReturnType<typeof createLoginSchema>>;
export type RegisterInput = z.infer<ReturnType<typeof createRegisterSchema>>;
export type ForgotPasswordInput = z.infer<ReturnType<typeof createForgotPasswordSchema>>;
export type ResetPasswordInput = z.infer<ReturnType<typeof createResetPasswordSchema>>;

/**
 * Error codes returned by the auth server actions.
 *
 * Codes rather than sentences, so the UI can show them in the student's own
 * language and so the server never leaks provider-specific wording.
 */
export type AuthErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "weak_password"
  | "email_not_confirmed"
  | "rate_limited"
  | "invalid_input"
  | "expired_link"
  | "unknown";

export type AuthActionResult = { ok: true } | { ok: false; code: AuthErrorCode };
