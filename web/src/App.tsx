import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { useEffect, useState } from 'react'
import { AuthService } from '@/services/AuthService'
import { useStore } from '@/store'

import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ConfirmEmailPage from '@/pages/auth/ConfirmEmailPage'
import GroupListPage from '@/pages/groups/GroupListPage'
import GroupPage from '@/pages/groups/GroupPage'
import CreateGroupPage from '@/pages/groups/CreateGroupPage'
import JoinGroupPage from '@/pages/groups/JoinGroupPage'
import AppLayout from '@/layouts/AppLayout'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const player = useStore((s) => s.player)
  if (!player) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const setPlayer = useStore((s) => s.setPlayer)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    AuthService.currentPlayer().then((p) => {
      setPlayer(p)
      setChecking(false)
    })
  }, [setPlayer])

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/confirm-email" element={<ConfirmEmailPage />} />

        {/* App */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/groups" replace />} />
          <Route path="groups" element={<GroupListPage />} />
          <Route path="groups/create" element={<CreateGroupPage />} />
          <Route path="groups/join" element={<JoinGroupPage />} />
          <Route path="groups/:groupId/*" element={<GroupPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
