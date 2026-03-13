import { NextResponse } from "next/server";

import { searchInputSchema } from "@/lib/search/schema";
import { searchSketch } from "@/lib/search/service";

export async function POST(request: Request) {
  try {
    const payload = searchInputSchema.parse(await request.json());
    const result = await searchSketch(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid search payload";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
