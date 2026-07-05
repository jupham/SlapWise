import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { FeedService } from '@/services/FeedService'
import { useStore } from '@/store'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from '@/lib/time'

const TYPE_LABELS: Record<string, string> = {
  manchester_created: 'Manchester',
  manchester_resolved: 'Resolved',
  slap_delivered: 'Delivered',
  chug_event: 'Game Call',
  member_joined: 'Joined',
}

export default function GroupFeedTab() {
  const { groupId } = useParams<{ groupId: string }>()
  const feedEntries = useStore((s) => s.feedEntries)
  const setFeedEntries = useStore((s) => s.setFeedEntries)

  useEffect(() => {
    if (!groupId) return
    FeedService.getFeed(groupId).then(setFeedEntries)
  }, [groupId, setFeedEntries])

  if (feedEntries.length === 0) {
    return <p className="text-muted-foreground text-sm">No activity yet.</p>
  }

  return (
    <div className="space-y-2">
      {feedEntries.map((entry) => (
        <div key={entry.entryId} className="flex items-start gap-3 py-3 border-b last:border-0">
          <div className="flex-1">
            <p className="text-sm">{entry.summary}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDistanceToNow(entry.createdAt)}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {TYPE_LABELS[entry.type] ?? entry.type}
          </Badge>
        </div>
      ))}
    </div>
  )
}
