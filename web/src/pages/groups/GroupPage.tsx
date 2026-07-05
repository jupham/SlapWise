import { useEffect, useState } from 'react'
import { useParams, useNavigate, Routes, Route, Navigate } from 'react-router-dom'
import { GroupService } from '@/services/GroupService'
import { useStore } from '@/store'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import GroupFeedTab from './tabs/GroupFeedTab'
import MySlateTab from './tabs/MySlateTab'
import PendingDebtsTab from './tabs/PendingDebtsTab'
import LedgerTab from './tabs/LedgerTab'
import GroupSettingsTab from './tabs/GroupSettingsTab'
import GrogTab from './tabs/GrogTab'

const TABS = [
  { id: 'feed', label: 'Feed' },
  { id: 'my-slate', label: 'My Slate' },
  { id: 'pending', label: 'Pending' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'grog', label: '🍺 Grog' },
  { id: 'settings', label: 'Settings' },
]

export default function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const setCurrentGroup = useStore((s) => s.setCurrentGroup)
  const setMembers = useStore((s) => s.setMembers)
  const currentGroup = useStore((s) => s.currentGroup)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) return
    Promise.all([
      GroupService.getGroup(groupId),
      GroupService.getGroupMembers(groupId),
    ]).then(([group, members]) => {
      setCurrentGroup(group)
      setMembers(members)
      setLoading(false)
    }).catch(() => {
      navigate('/groups')
    })
  }, [groupId, setCurrentGroup, setMembers, navigate])

  // Determine active tab from current path
  const path = window.location.pathname
  const activeTab = TABS.find((t) => path.includes(t.id))?.id ?? 'feed'

  if (loading) return <p className="text-muted-foreground">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{currentGroup?.name}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => navigate(`/groups/${groupId}/${v}`)}>
        <TabsList className="w-full overflow-x-auto flex">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex-1">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Routes>
        <Route index element={<Navigate to="feed" replace />} />
        <Route path="feed" element={<GroupFeedTab />} />
        <Route path="my-slate" element={<MySlateTab />} />
        <Route path="pending" element={<PendingDebtsTab />} />
        <Route path="ledger" element={<LedgerTab />} />
        <Route path="grog" element={<GrogTab />} />
        <Route path="settings" element={<GroupSettingsTab />} />
      </Routes>
    </div>
  )
}
