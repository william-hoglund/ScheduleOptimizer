/**
 * `z.toJSONSchema()` always emits `oneOf` for `z.discriminatedUnion` — there
 * is no zod option to change that (checked: `target` only selects a JSON
 * Schema draft, not this). OpenAI's strict Structured Outputs mode rejects
 * `oneOf` outright ("'oneOf' is not permitted"), and only accepts `anyOf` for
 * a union — a real, credit-gated failure only found by an actual API call in
 * Session 15, since every other schema here is union-free and the mismatch
 * doesn't show up in a schema-shape test that never renders `oneOf` itself.
 *
 * Rewriting `oneOf` to `anyOf` is safe for our case specifically: every
 * variant carries a distinct literal `kind`/discriminant, so "at least one
 * matches" (`anyOf`) and "exactly one matches" (`oneOf`) select the same
 * variant in practice — a value can only ever satisfy one branch's `const`.
 */
export function oneOfToAnyOf<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map((item) => oneOfToAnyOf(item)) as T;
  }
  if (node && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      result[key === "oneOf" ? "anyOf" : key] = oneOfToAnyOf(value);
    }
    return result as T;
  }
  return node;
}
