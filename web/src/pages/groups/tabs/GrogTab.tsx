import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { GrogService } from '@/services/GrogService'
import { GroupService } from '@/services/GroupService'
import { useStore } from '@/store'
import type { Grog, GrogEntry, GrogHistoryEvent, LiquorCategory, PendingAddBack } from '@/types'
import { LIQUOR_BRANDS, BOTTLE_SIZE_PRESETS } from '@/constants/grog'
import GrogSkull from '@/components/GrogSkull'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

// ── Helpers ──────────────────────────────────────────────────────────────────

const OZ_PER_ML = 1 / 29.5735

function mlToOz(ml: number) {
  return (ml * OZ_PER_ML).toFixed(2)
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

// ── Add Liquor Dialog ─────────────────────────────────────────────────────────

function AddLiquorDialog({
  title = 'Add Liquor',
  onSubmit,
  onClose,
}: {
  title?: string
  onSubmit: (category: LiquorCategory, brand: string) => Promise<void>
  onClose: () => void
}) {
  const [category, setCategory] = useState<LiquorCategory | ''>('')
  const [brand, setBrand] = useState('')
  const [customBrand, setCustomBrand] = useState('')
  const [loading, setLoading] = useState(false)

  const categories = Object.keys(CATEGORY_COLORS) as LiquorCategory[]
  const brandsForCategory = category ? LIQUOR_BRANDS.filter((b) => b.category === category) : []
  const effectiveBrand = brand === '__custom__' ? customBrand.trim() : brand

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!category || !effectiveBrand) return
    setLoading(true)
    try {
      await onSubmit(category, effectiveBrand)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v as LiquorCategory); setBrand('') }}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {category && (
            <div className="space-y-1">
              <Label>Brand</Label>
              <Select value={brand} onValueChange={(v) => setBrand(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {brandsForCategory.map((b) => (
                    <SelectItem key={b.brand} value={b.brand}>{b.brand}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Other (type below)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {brand === '__custom__' && (
            <div className="space-y-1">
              <Label>Custom brand name</Label>
              <Input value={customBrand} onChange={(e) => setCustomBrand(e.target.value)} placeholder="Brand name" />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading || !category || !effectiveBrand}>
              {loading ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Initialize Grog Dialog ────────────────────────────────────────────────────

function InitializeGrogDialog({
  groupId,
  onSuccess,
  onClose,
}: {
  groupId: string
  onSuccess: () => void
  onClose: () => void
}) {
  const [bottleSize, setBottleSize] = useState(750)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await GrogService.initializeGrog(groupId, bottleSize)
      onSuccess()
    } catch {
      setError('Failed to initialize grog.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Initialize the Grog</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-1">
            <Label>Bottle size</Label>
            <Select value={String(bottleSize)} onValueChange={(v) => setBottleSize(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BOTTLE_SIZE_PRESETS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s} mL</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Initializing…' : 'Initialize'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({ event, memberMap }: { event: GrogHistoryEvent; memberMap: Map<string, string> }) {
  const actor = memberMap.get(event.actorPlayerId) ?? event.actorPlayerId.slice(0, 8)
  let description: string
  if (event.type === 'addition') {
    description = `${actor} added ${event.brand ?? '?'} (${(event.category ?? '').replace(/_/g, ' ')})`
    if (event.amountMl != null) description += ` — ${event.amountMl.toFixed(1)} mL`
  } else {
    description = `${actor} took a shot`
    if (event.amountMl != null) description += ` (${event.amountMl.toFixed(1)} mL)`
  }
  return (
    <div className="flex items-start justify-between py-2 border-b last:border-0 gap-2">
      <p className="text-sm">{description}</p>
      <p className="text-xs text-muted-foreground shrink-0">{formatDate(event.occurredAt)}</p>
    </div>
  )
}

// ── Entry row (admin manage mode) ─────────────────────────────────────────────

function EntryRow({
  entry,
  onRemove,
  onAdjust,
}: {
  entry: GrogEntry
  onRemove: (id: string) => Promise<void>
  onAdjust: (id: string, ml: number) => Promise<void>
}) {
  const [draft, setDraft] = useState(entry.amountMl.toFixed(1))
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const color = CATEGORY_COLORS[entry.category]

  return (
    <div className="flex items-center gap-2 py-2 border-b last:border-0">
      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{entry.brand}</p>
        <p className="text-xs text-muted-foreground capitalize">{entry.category.replace(/_/g, ' ')} · {entry.amountMl.toFixed(1)} mL / {mlToOz(entry.amountMl)} oz</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Input
          className="w-16 h-7 text-xs text-center"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={saving}
          onClick={async () => {
            const ml = parseFloat(draft)
            if (isNaN(ml) || ml < 0) return
            setSaving(true)
            await onAdjust(entry.entryId, ml)
            setSaving(false)
          }}
        >✓</Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-destructive"
          disabled={removing}
          onClick={async () => { setRemoving(true); await onRemove(entry.entryId); setRemoving(false) }}
        >✕</Button>
      </div>
    </div>
  )
}

// ── Pending add-back row ──────────────────────────────────────────────────────

function PendingAddBackRow({
  entry,
  memberMap,
  groupId,
  onUpdated,
}: {
  entry: PendingAddBack
  memberMap: Map<string, string>
  groupId: string
  onUpdated: (g: Grog) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')
  const username = memberMap.get(entry.debtorId) ?? entry.debtorId.slice(0, 8)

  async function handleAdminAddBack(category: LiquorCategory, brand: string) {
    setShowAdd(false)
    try {
      const updated = await GrogService.adminAddBack(groupId, entry.debtId, category, brand)
      onUpdated(updated)
    } catch {
      setError('Failed to add shot.')
    }
  }

  async function handleClear() {
    setClearing(true)
    try {
      const updated = await GrogService.clearAddBack(groupId, entry.debtId)
      onUpdated(updated)
    } catch {
      setError('Failed to clear.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 gap-2">
      <div>
        <p className="text-sm font-medium">{username}</p>
        <p className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
        {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" onClick={() => setShowAdd(true)}>Add Shot</Button>
        <Button size="sm" variant="outline" disabled={clearing} onClick={handleClear}>
          {clearing ? '…' : 'Clear'}
        </Button>
      </div>
      {showAdd && (
        <AddLiquorDialog title="Record Shot Add-Back" onSubmit={handleAdminAddBack} onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function GrogTab() {
  const { groupId } = useParams<{ groupId: string }>()
  const player = useStore((s) => s.player)
  const members = useStore((s) => s.members)

  const [grog, setGrog] = useState<Grog | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [manageMode, setManageMode] = useState(false)
  const [showAddLiquor, setShowAddLiquor] = useState(false)
  const [showInitialize, setShowInitialize] = useState(false)
  const [sloshTrigger, setSloshTrigger] = useState(0)

  const memberMap = new Map(members.map((m) => [m.playerId, m.username]))

  const load = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    setError('')
    try {
      const [fetchedGrog, group] = await Promise.all([
        GrogService.getGrog(groupId),
        GroupService.getGroup(groupId),
      ])
      const resolved =
        fetchedGrog && (fetchedGrog.entries.length > 0 || fetchedGrog.history.length > 0 || fetchedGrog.bottleSize > 0)
          ? fetchedGrog
          : null
      setGrog(resolved)
      if (player) {
        setIsAdmin(group.adminIds.includes(player.playerId) || group.creatorId === player.playerId)
      }
    } catch {
      setError('Failed to load grog data.')
    } finally {
      setLoading(false)
    }
  }, [groupId, player])

  useEffect(() => { void load() }, [load])

  async function handleAddLiquor(category: LiquorCategory, brand: string) {
    if (!groupId) return
    const updated = await GrogService.addLiquor(groupId, category, brand)
    setGrog(updated)
    setSloshTrigger((n) => n + 1)
    setShowAddLiquor(false)
  }

  async function handleRemove(entryId: string) {
    if (!groupId) return
    const updated = await GrogService.removeLiquor(groupId, entryId)
    setGrog(updated)
  }

  async function handleAdjust(entryId: string, ml: number) {
    if (!groupId) return
    const updated = await GrogService.adjustGrogEntry(groupId, entryId, ml)
    setGrog(updated)
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>
  if (error) return (
    <div className="space-y-2">
      <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      <Button variant="outline" onClick={load}>Retry</Button>
    </div>
  )

  const pendingAddBacks = grog?.pendingAddBacks ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">The Grog</h2>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setManageMode((v) => !v)}>
            {manageMode ? 'Done' : 'Manage'}
          </Button>
        )}
      </div>

      {/* Skull visualizer */}
      <div className="flex justify-center">
        <GrogSkull
          entries={grog?.entries ?? []}
          bottleSize={grog?.bottleSize ?? 750}
          sloshTrigger={sloshTrigger}
          size={220}
        />
      </div>

      {/* Not initialized */}
      {grog === null && !manageMode && (
        <p className="text-center text-sm text-muted-foreground">The grog has not been initialized yet.</p>
      )}
      {grog === null && manageMode && (
        <Button className="w-full" onClick={() => setShowInitialize(true)}>Initialize Grog</Button>
      )}

      {/* Manage mode: contents */}
      {manageMode && grog !== null && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Contents</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAddLiquor(true)}>+ Add Liquor</Button>
            </div>
          </CardHeader>
          <CardContent>
            {grog.entries.length === 0
              ? <p className="text-sm text-muted-foreground">No liquors added yet.</p>
              : grog.entries.map((e) => (
                <EntryRow key={e.entryId} entry={e} onRemove={handleRemove} onAdjust={handleAdjust} />
              ))
            }
          </CardContent>
        </Card>
      )}

      {/* Manage mode: pending add-backs */}
      {manageMode && pendingAddBacks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pending Add-Backs</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingAddBacks.map((p) => (
              <PendingAddBackRow
                key={p.debtId}
                entry={p}
                memberMap={memberMap}
                groupId={groupId!}
                onUpdated={setGrog}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {grog !== null && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              History ({grog.history.length})
            </h3>
            {grog.history.length === 0
              ? <p className="text-sm text-muted-foreground">No history yet.</p>
              : [...grog.history].reverse().map((e) => (
                <HistoryRow key={e.eventId} event={e} memberMap={memberMap} />
              ))
            }
          </div>
        </>
      )}

      {/* Dialogs */}
      {showAddLiquor && (
        <AddLiquorDialog onSubmit={handleAddLiquor} onClose={() => setShowAddLiquor(false)} />
      )}
      {showInitialize && groupId && (
        <InitializeGrogDialog
          groupId={groupId}
          onSuccess={() => { setShowInitialize(false); void load() }}
          onClose={() => setShowInitialize(false)}
        />
      )}
    </div>
  )
}
