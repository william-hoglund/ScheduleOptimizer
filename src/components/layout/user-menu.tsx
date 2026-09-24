"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { signOut } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Initials for the avatar. Falls back to the email when no name is set yet. */
function initialsFrom(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "?";
  const second = parts.length > 1 ? (parts[1]?.charAt(0) ?? "") : "";
  return (first + second).toUpperCase();
}

export function UserMenu({ email, fullName }: { email: string; fullName: string | null }) {
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label={t("account")}>
            <span
              className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full text-[0.625rem] font-medium"
              aria-hidden="true"
            >
              {initialsFrom(fullName, email)}
            </span>
          </Button>
        }
      />

      <DropdownMenuContent align="end" className="w-56">
        {/* Grouped because Base UI's GroupLabel reads its group's context. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col items-start gap-0.5">
            {fullName ? (
              <span className="text-foreground text-sm font-medium">{fullName}</span>
            ) : null}
            <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isPending}
          onClick={() => startTransition(() => void signOut())}
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
