import { NextResponse } from "next/server";

import { recordResultEvent } from "@/lib/db/events";
import { feedbackEventSchema } from "@/lib/search/schema";

export async function POST(request: Request) {
  try {
    const payload = feedbackEventSchema.parse(await request.json());
    await recordResultEvent({
      eventType: "feedback",
      feedback: payload.feedback,
      sessionId: payload.sessionId,
      target: payload.feedback,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid feedback event";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
