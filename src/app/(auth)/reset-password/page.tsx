import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth");

  return (
    <AuthCard title={t("reset.title")} description={t("reset.subtitle")}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
