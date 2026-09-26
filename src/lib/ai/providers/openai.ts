import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { oneOfToAnyOf } from "../json-schema";
import { AiResponseInvalidError, type AiProvider, type GenerateObjectRequest } from "../types";

/**
 * OpenAI, talked to directly with `response_format: json_schema` in strict
 * mode rather than through the SDK's own zod helper.
 *
 * Building the JSON Schema ourselves with zod's native `z.toJSONSchema()`
 * (added in zod 4) avoids depending on the exact zod version the `openai`
 * package's helper happens to bundle internally — two independent
 * dependencies agreeing on a third one's shape is exactly the kind of thing
 * that breaks silently on a routine `npm update`.
 */
export function createOpenAiProvider(apiKey: string, model: string): AiProvider {
  const client = new OpenAI({ apiKey });

  return {
    async generateObject<S extends z.ZodTypeAny>({
      system,
      prompt,
      schema,
      maxOutputTokens,
    }: GenerateObjectRequest<S>): Promise<z.infer<S>> {
      const rawSchema = z.toJSONSchema(schema, { target: "draft-07" });
      // OpenAI's strict mode rejects a top-level $schema key, and rejects
      // `oneOf` outright — see json-schema.ts for why rewriting it is safe.
      delete (rawSchema as { $schema?: unknown }).$schema;
      const jsonSchema = oneOfToAnyOf(rawSchema);

      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: maxOutputTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "response", strict: true, schema: jsonSchema },
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new AiResponseInvalidError("OpenAI returned no content");
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch (cause) {
        throw new AiResponseInvalidError(`OpenAI response was not valid JSON: ${String(cause)}`);
      }

      const result = schema.safeParse(parsedJson);
      if (!result.success) {
        throw new AiResponseInvalidError(
          `OpenAI response did not match the schema: ${result.error.message}`,
        );
      }

      return result.data;
    },
  };
}
