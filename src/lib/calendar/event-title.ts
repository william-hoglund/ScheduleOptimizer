/**
 * Splits an event's display name into a course code and the rest, dropping
 * the code when the title already starts with it — imported timetables name
 * classes "INFS2702 - TUT", which next to a "INFS2702" tag read as
 * "INFS2702 — INFS2702 - TUT".
 */
export function splitEventTitle(code: string | null | undefined, title: string): { code: string | null; title: string } {
  const trimmed = title.trim();
  if (!code) return { code: null, title: trimmed };

  const normalize = (text: string) => text.replace(/\s+/g, "").toUpperCase();
  const codeKey = normalize(code);

  // Walk the title until its letters/digits have covered the whole code.
  let consumed = 0;
  let matched = "";
  while (consumed < trimmed.length && matched.length < codeKey.length) {
    const char = trimmed[consumed] ?? "";
    if (!/\s/.test(char)) matched += char.toUpperCase();
    consumed += 1;
  }

  // The code must end at a word boundary: "INFS27" is not a prefix of "INFS2702".
  if (matched !== codeKey || /[\p{L}\p{N}]/u.test(trimmed[consumed] ?? "")) return { code, title: trimmed };

  const rest = trimmed.slice(consumed).replace(/^[\s\-–—:|·/]+/, "").trim();
  return { code, title: rest.length > 0 ? rest : trimmed };
}
