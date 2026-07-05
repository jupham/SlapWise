import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ManchesterService } from '@/services/ManchesterService'
import { useStore } from '@/store'
import type { PlayerDebtIndex } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from '@/lib/time'
import CreateChallengeDialog from '../dialogs/CreateChallengeDialog'
import ResolutionDialog from '../dialogs/ResolutionDialog'

export default function MySlateTab() {
  const { groupId } = useParams<{ groupId: string }>()
  const player = useStore((s) => s.player)
  const members = useStore((s) => s.members)
  const [debts, setDebts] = useState<PlayerDebtIndex[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [resolving, setResolving] = useState<PlayerDebtIndex | null>(null)

  async function load() {
    if (!groupId) return
    const d = await ManchesterService.getMyDebts(groupId)
    setDebts(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [groupId])

  const memberName = (id: string) =>
    members.find((m) => m.playerId === id)?.username ?? id.slice(0, 8)

  const active = debts.filter((d) => d.status !== 'delivered')

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>Call Manchester</Button>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {!loading && active.length === 0 && (
        <p className="text-muted-foreground text-sm">Clean slate — no active debts.</p>
      )}

      <div className="space-y-2">
        {active.map((debt) => {
          const isChallenger = debt.role === 'challenger'
          const opponent = memberName(isChallenger ? debt.statementMakerId : debt.challengerId)
          const canResolve =
            debt.status === 'pending' || debt.status === 'pending_confirmation'

          return (
            <Card key={debt.debtId}>
              <CardContent className="py-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">"{debt.statement}"</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isChallenger ? `You called on ${opponent}` : `${opponent} called on you`}
                    </p>
                  </div>
                  <Badge variant={debt.status === 'resolved' ? 'default' : 'secondary'}>
                    {debt.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(debt.createdAt)}
                  </span>
                  {canResolve && player?.playerId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setResolving(debt)}
                    >
                      Confirm outcome
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {showCreate && groupId && (
        <CreateChallengeDialog
          groupId={groupId}
          members={members.filter((m) => m.playerId !== player?.playerId)}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}

      {resolving && groupId && (
        <ResolutionDialog
          groupId={groupId}
          debt={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => { setResolving(null); load() }}
        />
      )}
    </div>
  )
}
