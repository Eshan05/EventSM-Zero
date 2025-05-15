import { NextRequest, NextResponse } from "next/server";
import { users as usersTable } from "@/db/schema";
import { hashPassword } from "@/utils/password"
import { signUpSchema } from "@/lib/zod.auth";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { DrizzleError, eq, or } from "drizzle-orm";
import { getClientIP } from "@/utils/client-ip";
import { typedDb as db } from "@/lib/utils.server";

const redis = Redis.fromEnv();
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, "60s"),
  prefix: "signup_rl",
});

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const { success, limit, remaining, reset } = await ratelimit.limit(`ip_${ip}`);

  if (!success) {
    return NextResponse.json(
      { message: "Too many sign-up attempts. Please try again later." },
      {
        status: 429, headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        }
      }
    );
  }

  try {
    const body = await request.json();
    const validation = signUpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { message: "Invalid input.", details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, username, password } = validation.data;

    // Check if email or username already exists
    const existingUser = await db.query.users.findFirst({
      where: or(eq(usersTable.email, email.toLowerCase()), eq(usersTable.username, username))
    });

    if (existingUser) {
      let message = "";
      if (existingUser.email === email.toLowerCase()) message = "An account with this email already exists.";
      else if (existingUser.username === username) message = "This username is already taken.";
      return NextResponse.json({ message: message || "User already exists" }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);

    await db.insert(usersTable).values({
      email: email.toLowerCase(),
      name: username,
      username,
      hashedPassword,
      role: "user",
      image: generateRandomAvatar(),
    });

    return NextResponse.json(
      { message: "Account created successfully! You can now sign in." },
      { status: 201 }
    );

  } catch (error) {
    console.error("Sign-up error:", error);
    if (error instanceof DrizzleError) {
      return NextResponse.json({ message: "Database error during sign up. Please try again." }, { status: 500 });
    }
    return NextResponse.json({ message: "An unexpected error occurred during sign up." }, { status: 500 });
  }
}

function generateRandomAvatar(seed?: string): string {
  const actualSeed = seed ? parseInt(seed) % 20 + 1 : Math.floor(Math.random() * 20) + 1;
  const style = 'shapes';
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${actualSeed}?size=32`;
}
