import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");

  return (
    <AuthCard
      title={t("forgot.title")}
      description={t("forgot.subtitle")}
      footer={
        <Link
          href="/login"
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          {t("forgot.backToLogin")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
