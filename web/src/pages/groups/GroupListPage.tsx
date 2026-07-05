import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GroupService } from '@/services/GroupService'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PlusIcon, UsersIcon } from 'lucide-react'

export default function GroupListPage() {
  const groups = useStore((s) => s.groups)
  const setGroups = useStore((s) => s.setGroups)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    GroupService.getGroups()
      .then(setGroups)
      .finally(() => setLoading(false))
  }, [setGroups])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your Groups</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/groups/join')}>
            Join
          </Button>
          <Button onClick={() => navigate('/groups/create')}>
            <PlusIcon className="h-4 w-4 mr-1" />
            New Group
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground">Loading…</p>}

      {!loading && groups.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <UsersIcon className="mx-auto h-8 w-8 mb-2 opacity-40" />
            <p>You're not in any groups yet.</p>
            <p className="text-sm mt-1">Create one or ask a friend for their invite code.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <Link key={g.groupId} to={`/groups/${g.groupId}`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardContent className="py-4 flex items-center justify-between">
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground text-sm">›</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
