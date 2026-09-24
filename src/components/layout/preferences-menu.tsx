"use client";

import { Languages, SlidersHorizontal, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useTransition } from "react";

import { locales, localeNames } from "@/i18n/config";
import { setLocale } from "@/i18n/locale-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function PreferencesMenu() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      {/* A fixed icon rather than one reflecting the active theme. The current
          theme is only known after hydration, so a reactive icon would either
          flash the wrong one or need a mount flag; and the menu itself already
          shows which option is selected. */}
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t("theme")}>
            <SlidersHorizontal className="size-[1.125rem]" aria-hidden="true" />
          </Button>
        }
      />

      <DropdownMenuContent align="end" className="w-48">
        {/* Each label sits inside its radio group: Base UI's GroupLabel reads
            the group's context to associate itself for screen readers, and
            throws if rendered outside one. */}
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuLabel className="flex items-center gap-2">
            <Sun className="size-3.5" aria-hidden="true" />
            {t("theme")}
          </DropdownMenuLabel>
          <DropdownMenuRadioItem value="light">{t("themeLight")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t("themeDark")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{t("themeSystem")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(next) => startTransition(() => void setLocale(next))}
        >
          <DropdownMenuLabel className="flex items-center gap-2">
            <Languages className="size-3.5" aria-hidden="true" />
            {t("language")}
          </DropdownMenuLabel>
          {locales.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} disabled={isPending}>
              {localeNames[code]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
