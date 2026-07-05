import { useState } from 'react'
import { useStore } from '@/store'
import { GroupService } from '@/services/GroupService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export default function GroupSettingsTab() {
  const currentGroup = useStore((s) => s.currentGroup)
  const members = useStore((s) => s.members)
  const player = useStore((s) => s.player)
  const setCurrentGroup = useStore((s) => s.setCurrentGroup)
  const [copying, setCopying] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const isAdmin = currentGroup?.adminIds.includes(player?.playerId ?? '') ?? false

  async function handleCopyCode() {
    if (!currentGroup) return
    setCopying(true)
    await navigator.clipboard.writeText(currentGroup.inviteCode)
    toast('Invite code copied!')
    setTimeout(() => setCopying(false), 1500)
  }

  async function handleRegenerate() {
    if (!currentGroup) return
    setRegenerating(true)
    try {
      const newCode = await GroupService.regenerateInviteCode(currentGroup.groupId)
      setCurrentGroup({ ...currentGroup, inviteCode: newCode })
      toast('New invite code generated.')
    } catch {
      toast('Failed to regenerate code.')
    } finally {
      setRegenerating(false)
    }
  }

  if (!currentGroup) return null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite code</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="bg-muted px-3 py-1.5 rounded text-lg font-mono tracking-widest">
              {currentGroup.inviteCode}
            </code>
            <Button size="sm" variant="outline" onClick={handleCopyCode} disabled={copying}>
              {copying ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? 'Regenerating…' : 'Regenerate code'}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <div key={m.playerId} className="flex items-center justify-between">
              <span className="text-sm">{m.username}</span>
              <div className="flex gap-1">
                {currentGroup.adminIds.includes(m.playerId) && (
                  <Badge variant="secondary" className="text-xs">Admin</Badge>
                )}
                {m.isReadIn && (
                  <Badge variant="outline" className="text-xs">Read In</Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
