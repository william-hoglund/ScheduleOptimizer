import { NextResponse } from "next/server";
import { z } from "zod";

import { defaultLocale, isLocale } from "@/i18n/config";
import { extractSchedule, isAiEnabled, type ImageInput } from "@/lib/ai";
import { AI_LIMITS } from "@/lib/ai/types";
import { requireUser } from "@/server/auth";
import { getProfile } from "@/server/profile-service";

/**
 * Reading a photo or screenshot of a timetable.
 *
 * A Route Handler, not a Server Action: the image arrives as a base64 JSON
 * body that can run to a few MB even after the client downscales it, well
 * past a Server Action's default body limit (the same reason course document
 * uploads go straight to Supabase Storage — see document-upload-panel.tsx).
 * Nothing is stored here; this is a single request/response round trip, nothing
 * persists afterward the way an uploaded course document does.
 */

const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

const requestSchema = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.enum(IMAGE_MEDIA_TYPES),
});

/** Base64 is ~4/3 the original byte size; this bounds the decoded size. */
function decodedByteLength(base64: string): number {
  return Math.floor((base64.length * 3) / 4);
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!isAiEnabled()) {
    return NextResponse.json({ ok: false, error: "aiUnavailable" }, { status: 200 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalidInput" }, { status: 200 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalidInput" }, { status: 200 });
  }

  if (decodedByteLength(parsed.data.imageBase64) > AI_LIMITS.maxScheduleImageBytes) {
    return NextResponse.json({ ok: false, error: "tooLarge" }, { status: 200 });
  }

  const image: ImageInput = { base64: parsed.data.imageBase64, mediaType: parsed.data.mediaType };

  const profile = await getProfile(user.id);
  const locale = profile?.locale && isLocale(profile.locale) ? profile.locale : defaultLocale;

  const extraction = await extractSchedule({ locale, image });
  if (!extraction) {
    return NextResponse.json({ ok: false, error: "extractionFailed" }, { status: 200 });
  }

  if (!extraction.looksLikeASchedule) {
    return NextResponse.json({ ok: false, error: "notASchedule" }, { status: 200 });
  }

  return NextResponse.json({ ok: true, data: extraction }, { status: 200 });
}
