import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  authConfigProblem,
  createSessionToken,
  passwordMatches,
  sessionCookieOptions,
} from "@/lib/server/auth";

const Body = z.object({ password: z.string().min(1).max(1000) });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const problem = authConfigProblem();
  if (problem) {
    console.error(`[login] ${problem} Check .env.local (or Vercel env vars).`);
    return NextResponse.json(
      { error: "Server is not configured. Check the terminal." },
      { status: 500 },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));

  if (!parsed.success || !passwordMatches(parsed.data.password)) {
    await wait(1000); // slows down guessing
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return response;
}
