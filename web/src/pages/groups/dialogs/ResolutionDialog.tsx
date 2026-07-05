import { useState } from 'react'
import { ManchesterService } from '@/services/ManchesterService'
import type { PlayerDebtIndex, ResolutionOutcome, PunishmentType } from '@/types'
import { useStore } from '@/store'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Props {
  groupId: string
  debt: PlayerDebtIndex
  onClose: () => void
  onResolved: () => void
}

export default function ResolutionDialog({ groupId, debt, onClose, onResolved }: Props) {
  const members = useStore((s) => s.members)
  const [outcome, setOutcome] = useState<ResolutionOutcome | ''>('')
  const [punishment, setPunishment] = useState<PunishmentType>('slap')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const memberName = (id: string) =>
    members.find((m) => m.playerId === id)?.username ?? id.slice(0, 8)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!outcome) return
    setError('')
    setLoading(true)
    try {
      await ManchesterService.submitResolutionConfirmation(
        debt.debtId,
        groupId,
        outcome as ResolutionOutcome,
        punishment
      )
      onResolved()
    } catch {
      setError('Failed to submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm outcome</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-2">
          <p className="font-medium text-foreground">"{debt.statement}"</p>
          <p className="mt-1">
            {memberName(debt.challengerId)} called on {memberName(debt.statementMakerId)}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label>Did they follow through?</Label>
            <Select value={outcome} onValueChange={(v) => setOutcome(v as ResolutionOutcome)}>
              <SelectTrigger>
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="followed_through">Yes — they followed through</SelectItem>
                <SelectItem value="did_not_follow_through">No — they didn't follow through</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>How is the debt settled?</Label>
            <Select value={punishment} onValueChange={(v) => setPunishment(v as PunishmentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slap">Slap</SelectItem>
                <SelectItem value="infinity_grog">Infinity Grog</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !outcome}>
              {loading ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
