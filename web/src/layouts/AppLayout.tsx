import { Outlet, useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useStore } from '@/store'
import { AuthService } from '@/services/AuthService'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export default function AppLayout() {
  const player = useStore((s) => s.player)
  const setPlayer = useStore((s) => s.setPlayer)
  const navigate = useNavigate()

  async function handleLogout() {
    await AuthService.logout()
    setPlayer(null)
    navigate('/login')
  }

  const initials = player?.username?.slice(0, 2).toUpperCase() ?? '??'

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <Link to="/groups" className="font-bold text-lg tracking-tight">
          SlapWise
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-8 w-8 cursor-pointer">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled className="text-muted-foreground text-xs">
              {player?.username}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="flex-1 container max-w-3xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
