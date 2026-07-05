import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ManchesterService } from '@/services/ManchesterService'
import { useStore } from '@/store'
import type { SlapDebt } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from '@/lib/time'

export default function PendingDebtsTab() {
  const { groupId } = useParams<{ groupId: string }>()
  const members = useStore((s) => s.members)
  const [debts, setDebts] = useState<SlapDebt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) return
    ManchesterService.getDebtsByStatus(groupId, 'pending')
      .then(setDebts)
      .finally(() => setLoading(false))
  }, [groupId])

  const memberName = (id: string | null) =>
    id ? (members.find((m) => m.playerId === id)?.username ?? id.slice(0, 8)) : '?'

  return (
    <div className="space-y-2">
      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {!loading && debts.length === 0 && (
        <p className="text-muted-foreground text-sm">No pending debts. Everyone's honest!</p>
      )}
      {debts.map((debt) => (
        <Card key={debt.debtId}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">"{debt.statement}"</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {memberName(debt.challengerId)} → {memberName(debt.statementMakerId)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(debt.createdAt)}
                </p>
              </div>
              <Badge variant="secondary">{debt.status.replace('_', ' ')}</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
