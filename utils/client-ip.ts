import type { NextRequest } from "next/server";

export function getClientIP(req: NextRequest | Request): string {
  let clientIp = "";
  const xRealIp = req.headers.get('x-real-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  const xVercelForwardedFor = req.headers.get('x-vercel-forwarded-for');

  if (xRealIp) {
    clientIp = xRealIp;
  } else if (xVercelForwardedFor || xForwardedFor) {
    const forwarded = xVercelForwardedFor || xForwardedFor || "";
    clientIp = forwarded.split(',')[0].trim();
  } else {
    // NextRequest doesn't expose socket.remoteAddress directly
    // Use the connection info API if available on this NextRequest
    const connectionInfo = req.headers.get('x-forwarded-host') ||
      req.headers.get('host') || '';
    clientIp = connectionInfo || "127.0.0.1";
  }

  if (clientIp.startsWith("::ffff:")) clientIp = clientIp.slice(7);
  return clientIp;
}