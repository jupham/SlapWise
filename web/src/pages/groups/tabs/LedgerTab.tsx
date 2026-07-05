import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ManchesterService } from '@/services/ManchesterService'
import { useStore } from '@/store'
import type { SlapDebt } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatDistanceToNow } from '@/lib/time'

export default function LedgerTab() {
  const { groupId } = useParams<{ groupId: string }>()
  const members = useStore((s) => s.members)
  const player = useStore((s) => s.player)
  const [debts, setDebts] = useState<SlapDebt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) return
    ManchesterService.getDebtsByStatus(groupId, 'resolved')
      .then(setDebts)
      .finally(() => setLoading(false))
  }, [groupId])

  const memberName = (id: string | null) =>
    id ? (members.find((m) => m.playerId === id)?.username ?? id.slice(0, 8)) : '?'

  // Net summary: how many slaps does the current player owe each other player?
  const netMap: Record<string, number> = {}
  for (const debt of debts) {
    if (debt.status !== 'resolved') continue
    const { debtorId, creditorId } = debt
    if (!debtorId || !creditorId) continue
    if (debtorId === player?.playerId) {
      netMap[creditorId] = (netMap[creditorId] ?? 0) + 1
    } else if (creditorId === player?.playerId) {
      netMap[debtorId] = (netMap[debtorId] ?? 0) - 1
    }
  }

  const netEntries = Object.entries(netMap).filter(([, n]) => n !== 0)

  return (
    <div className="space-y-4">
      {player && netEntries.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
            Your outstanding
          </h2>
          <div className="space-y-1">
            {netEntries.map(([pid, net]) => (
              <div key={pid} className="flex items-center justify-between text-sm">
                <span>{memberName(pid)}</span>
                <span className={net > 0 ? 'text-destructive' : 'text-green-600'}>
                  {net > 0 ? `You owe ${net} slap${net > 1 ? 's' : ''}` : `Owed ${Math.abs(net)} slap${Math.abs(net) > 1 ? 's' : ''}`}
                </span>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
        </div>
      )}

      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        All resolved debts
      </h2>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {!loading && debts.length === 0 && (
        <p className="text-muted-foreground text-sm">No resolved debts yet.</p>
      )}

      <div className="space-y-2">
        {debts.map((debt) => (
          <Card key={debt.debtId}>
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">"{debt.statement}"</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {memberName(debt.debtorId)} owes {memberName(debt.creditorId)} a{' '}
                    {debt.debtPunishment === 'infinity_grog' ? 'grog shot' : 'slap'}
                  </p>
                  {debt.resolvedAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(debt.resolvedAt)}
                    </p>
                  )}
                </div>
                <Badge variant={debt.status === 'delivered' ? 'default' : 'secondary'}>
                  {debt.status}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
