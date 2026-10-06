import { z } from "zod";

/** A short label for untitled study material, as a student would name it. */
export const materialTitleSchema = z.object({
  title: z.string().min(1).max(80),
});

export type MaterialTitle = z.infer<typeof materialTitleSchema>;
