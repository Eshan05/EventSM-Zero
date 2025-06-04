import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { Redis } from '@upstash/redis'

import { blockedWords as blockedWordsTable } from '@/db/schema'
import { typedDb as db } from '@/lib/utils.server'
import { auth, CustomSession } from '@/lib/auth'

const redis = Redis.fromEnv()
const BLOCKED_WORDS_CACHE_KEY = 'blocked_words:v1'

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || (session.user as CustomSession['user']).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  await db.delete(blockedWordsTable).where(eq(blockedWordsTable.id, id))
  await redis.del(BLOCKED_WORDS_CACHE_KEY)

  return NextResponse.json({ ok: true })
}
