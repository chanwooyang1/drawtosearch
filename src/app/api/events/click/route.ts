import { NextResponse } from "next/server";

import { recordResultEvent } from "@/lib/db/events";
import { clickEventSchema } from "@/lib/search/schema";

export async function POST(request: Request) {
  try {
    const payload = clickEventSchema.parse(await request.json());
    await recordResultEvent(payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid click event";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
