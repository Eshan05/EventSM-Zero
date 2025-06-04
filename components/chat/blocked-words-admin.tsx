'use client'

import { useState } from 'react'
import { ShieldAlertIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

type BlockedWordItem = {
  id: string
  word: string
  createdAt: string | Date
  addedByUserId: string
  addedByUsername: string | null
}

export function BlockedWordsAdminButton() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [items, setItems] = useState<BlockedWordItem[]>([])
  const [newWord, setNewWord] = useState('')

  const refresh = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/blocked-words', { cache: 'no-store' })
      const data = (await res.json()) as { items?: BlockedWordItem[]; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setItems(data.items ?? [])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      void refresh()
    }
  }

  const handleAdd = async () => {
    const word = newWord.trim()
    if (!word) return

    setIsLoading(true)
    try {
      const res = await fetch('/api/blocked-words', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setNewWord('')
      await refresh()
      toast.success('Blocked word added')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/blocked-words/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      await refresh()
      toast.success('Blocked word removed')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="md-icon" onClick={() => handleOpenChange(true)} title="Blocked words">
        <ShieldAlertIcon className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Blocked words</DialogTitle>
            <DialogDescription>
              Messages containing these words will be rejected (non-admins).
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder="Add word or phrase…"
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleAdd()
                }
              }}
            />
            <Button type="button" onClick={() => void handleAdd()} disabled={isLoading || !newWord.trim()}>
              Add
            </Button>
          </div>

          <Separator />

          <div className="max-h-[45vh] overflow-y-auto space-y-2">
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">No blocked words yet.</div>
            ) : (
              items.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-3 rounded-md border border-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-mono text-sm truncate">{w.word}</div>
                    <div className="text-xs text-muted-foreground">
                      Added by {w.addedByUsername || 'unknown'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDelete(w.id)}
                    disabled={isLoading}
                    title="Remove"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
