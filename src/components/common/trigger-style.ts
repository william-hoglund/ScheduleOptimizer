import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * How a dialog's trigger button should look.
 *
 * Described rather than passed as a ReactElement on purpose: nesting a
 * `<Button>` inside a Base UI trigger makes both components write `data-slot`,
 * and they resolve in a different order on the server than in the browser — a
 * hydration mismatch. Styling the trigger directly keeps it a single element.
 */
export type TriggerStyle = {
  label?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  className?: string;
};

export function triggerClassName(trigger: TriggerStyle): string {
  return cn(buttonVariants({ variant: trigger.variant, size: trigger.size }), trigger.className);
}
