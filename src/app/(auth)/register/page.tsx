import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export async function generateMetadata() {
  const t = await getTranslations("auth.register");
  return { title: t("title") };
}

export default async function RegisterPage() {
  const t = await getTranslations("auth");

  return (
    <AuthCard
      title={t("register.title")}
      description={t("register.subtitle")}
      footer={
        <>
          {t("register.haveAccount")}{" "}
          <Link
            href="/login"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {t("register.signIn")}
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
