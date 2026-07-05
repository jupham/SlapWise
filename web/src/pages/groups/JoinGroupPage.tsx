import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GroupService } from '@/services/GroupService'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function JoinGroupPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setGroups = useStore((s) => s.setGroups)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const joined = await GroupService.joinGroup(code.trim().toUpperCase())
      const all = await GroupService.getGroups()
      setGroups(all)
      navigate(`/groups/${joined.groupId}`)
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg === 'INVALID_INVITE_CODE') setError('Invalid or expired invite code.')
      else setError('Failed to join group. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Join a group</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label htmlFor="code">Invite code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                placeholder="ABC123"
                className="uppercase tracking-widest"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
              {loading ? 'Joining…' : 'Join'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate('/groups')}
            >
              Cancel
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
