import { useState } from 'react'
import { ManchesterService } from '@/services/ManchesterService'
import type { Member } from '@/types'
import { useStore } from '@/store'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Props {
  groupId: string
  members: Member[]
  onClose: () => void
  onCreated: () => void
}

export default function CreateChallengeDialog({ groupId, members, onClose, onCreated }: Props) {
  const player = useStore((s) => s.player)
  const [statementMakerId, setStatementMakerId] = useState('')
  const [statement, setStatement] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!statementMakerId || !statement.trim()) return
    if (statementMakerId === player?.playerId) {
      setError("You can't call Manchester on yourself.")
      return
    }
    setError('')
    setLoading(true)
    try {
      await ManchesterService.createChallenge(groupId, statementMakerId, statement.trim())
      onCreated()
    } catch {
      setError('Failed to create challenge. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Call Manchester</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label>Who made the statement?</Label>
            <Select value={statementMakerId} onValueChange={(v) => setStatementMakerId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Select a player" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.playerId} value={m.playerId}>
                    {m.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="statement">The statement</Label>
            <Input
              id="statement"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="I'll definitely do the thing"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !statementMakerId || !statement.trim()}>
              {loading ? 'Calling…' : 'Call Manchester'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
