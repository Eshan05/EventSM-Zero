import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from 'jose';
import { TextEncoder } from 'util';
import { auth, CustomSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await auth();
  const user = session?.user as CustomSession["user"] | undefined;

  if (!session || !user || !user.id) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const zeroPayload = {
    sub: user.id,
    role: user.role,
    username: user.username,
    name: user.name,
    email: user.email,
  };

  const secretString = process.env.AUTH_SECRET;
  if (!secretString) {
    console.error("Zero Token API: NEXTAUTH_SECRET environment variable not set.");
    return NextResponse.json({ message: "Server configuration error for token generation" }, { status: 500 });
  }
  const secretKey = new TextEncoder().encode(secretString);

  try {
    const zeroToken = await new SignJWT(zeroPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      // .setIssuer('urn:example:issuer') 
      // .setAudience('urn:example:audience')
      .setExpirationTime('1d')
      .sign(secretKey);

    return NextResponse.json({ zeroToken, userId: user.id });
  } catch (error) {
    console.error("Zero Token API: Error signing JWT:", error);
    return NextResponse.json({ message: "Failed to generate token" }, { status: 500 });
  }
}