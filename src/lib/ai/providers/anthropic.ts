import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { AiResponseInvalidError, type AiProvider, type GenerateObjectRequest } from "../types";

/**
 * Anthropic, via a single forced tool call.
 *
 * Claude has no "strict JSON schema" mode the way OpenAI does, so the schema
 * is offered as one tool's input shape and `tool_choice` forces that exact
 * tool — the model cannot reply with plain text instead. The result is
 * validated the same way regardless: `schema.safeParse`, not "trust the
 * provider". A provider that is merely very reliable is not the same
 * guarantee as one that is schema-checked before anything downstream sees it.
 */
export function createAnthropicProvider(apiKey: string, model: string): AiProvider {
  const client = new Anthropic({ apiKey });

  return {
    async generateObject<S extends z.ZodTypeAny>({
      system,
      prompt,
      schema,
      maxOutputTokens,
      images,
    }: GenerateObjectRequest<S>): Promise<z.infer<S>> {
      const jsonSchema = z.toJSONSchema(schema, { target: "draft-07" });
      delete (jsonSchema as { $schema?: unknown }).$schema;

      // Images first, text last — Anthropic's own guidance for multi-image
      // prompts, so the model reads the question after it has already seen
      // what it is being asked about.
      const content: Anthropic.MessageParam["content"] = images?.length
        ? [
            ...images.map(
              (image): Anthropic.ImageBlockParam => ({
                type: "image",
                source: { type: "base64", media_type: image.mediaType, data: image.base64 },
              }),
            ),
            { type: "text", text: prompt },
          ]
        : prompt;

      const response = await client.messages.create({
        model,
        max_tokens: maxOutputTokens,
        system,
        messages: [{ role: "user", content }],
        tools: [
          {
            name: "respond",
            description: "Provide the response in the required shape.",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic's Tool.input_schema type is a narrower hand-written subset of JSON Schema than what z.toJSONSchema emits.
            input_schema: jsonSchema as any,
          },
        ],
        tool_choice: { type: "tool", name: "respond" },
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      if (!toolUse) {
        throw new AiResponseInvalidError("Anthropic did not return a tool call");
      }

      const result = schema.safeParse(toolUse.input);
      if (!result.success) {
        throw new AiResponseInvalidError(
          `Anthropic response did not match the schema: ${result.error.message}`,
        );
      }

      return result.data;
    },
  };
}
