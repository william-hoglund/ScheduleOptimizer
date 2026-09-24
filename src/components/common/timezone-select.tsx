"use client";

import { useMemo } from "react";

import { NativeSelect } from "./native-select";

/**
 * Time zones read from the browser's own IANA database rather than a list we
 * maintain, so it never goes stale.
 *
 * A handful of Nordic and European zones are pinned to the top because that is
 * where the students using this actually are; the full list follows.
 */
const PINNED = [
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/London",
  "Europe/Berlin",
];

function allTimezones(): string[] {
  const supported = Intl.supportedValuesOf?.("timeZone");
  // Older engines lack supportedValuesOf; the pinned list still lets the
  // student pick something sensible.
  return supported && supported.length > 0 ? [...supported] : PINNED;
}

export function TimezoneSelect({
  label,
  hint,
  error,
  ref,
  ...props
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
} & React.ComponentProps<"select">) {
  const { pinned, rest } = useMemo(() => {
    const zones = allTimezones();
    const pinnedAvailable = PINNED.filter((zone) => zones.includes(zone));
    return {
      pinned: pinnedAvailable,
      rest: zones.filter((zone) => !pinnedAvailable.includes(zone)),
    };
  }, []);

  return (
    <NativeSelect label={label} hint={hint} error={error} ref={ref} {...props}>
      {pinned.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, " ")}
        </option>
      ))}
      <option disabled>──────────</option>
      {rest.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, " ")}
        </option>
      ))}
    </NativeSelect>
  );
}
