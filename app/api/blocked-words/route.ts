import { NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { Redis } from '@upstash/redis'

import { blockedWords as blockedWordsTable, users as usersTable } from '@/db/schema'
import { typedDb as db } from '@/lib/utils.server'
import { auth, CustomSession } from '@/lib/auth'

const redis = Redis.fromEnv()
const BLOCKED_WORDS_CACHE_KEY = 'blocked_words:v1'

export async function GET() {
  const session = await auth()
  if (!session?.user || (session.user as CustomSession['user']).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const rows = await db
    .select({
      id: blockedWordsTable.id,
      word: blockedWordsTable.word,
      createdAt: blockedWordsTable.createdAt,
      addedByUserId: blockedWordsTable.addedByUserId,
      addedByUsername: usersTable.username,
    })
    .from(blockedWordsTable)
    .leftJoin(usersTable, eq(blockedWordsTable.addedByUserId, usersTable.id))
    .orderBy(asc(blockedWordsTable.word))

  return NextResponse.json({ items: rows })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || (session.user as CustomSession['user']).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { word?: unknown } | null
  const wordRaw = typeof body?.word === 'string' ? body.word : ''
  const word = wordRaw.trim().toLowerCase()

  if (!word) return NextResponse.json({ error: 'Word is required' }, { status: 400 })
  if (word.length > 100) return NextResponse.json({ error: 'Word too long' }, { status: 400 })

  try {
    const inserted = await db
      .insert(blockedWordsTable)
      .values({
        word,
        addedByUserId: (session.user as CustomSession['user']).id,
      })
      .returning({
        id: blockedWordsTable.id,
        word: blockedWordsTable.word,
        createdAt: blockedWordsTable.createdAt,
        addedByUserId: blockedWordsTable.addedByUserId,
      })

    await redis.del(BLOCKED_WORDS_CACHE_KEY)

    return NextResponse.json({ item: inserted[0] }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.toLowerCase().includes('unique')) {
      return NextResponse.json({ error: 'Word already blocked' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to add blocked word' }, { status: 500 })
  }
}
