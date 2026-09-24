import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import type { AuthErrorCode } from "@/lib/validation/auth";

const KNOWN_ERROR_CODES = new Set<string>([
  "invalid_credentials",
  "email_taken",
  "weak_password",
  "email_not_confirmed",
  "rate_limited",
  "invalid_input",
  "expired_link",
  "unknown",
]);

export async function generateMetadata() {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const t = await getTranslations("auth");

  // Re-checked here as well as in the callback: a `next` value arriving in the
  // URL is attacker-controlled, so only same-site paths are honoured.
  const rawNext = searchParams.next;
  const next =
    typeof rawNext === "string" && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

  const rawError = searchParams.error;
  const initialError =
    typeof rawError === "string" && KNOWN_ERROR_CODES.has(rawError)
      ? (rawError as AuthErrorCode)
      : null;

  return (
    <AuthCard
      title={t("login.title")}
      description={t("login.subtitle")}
      footer={
        <>
          {t("login.noAccount")}{" "}
          <Link
            href="/register"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {t("login.createAccount")}
          </Link>
        </>
      }
    >
      <LoginForm next={next} initialError={initialError} />
    </AuthCard>
  );
}
