import { useEffect, useState } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useAuth, useMe } from '../lib/session'
import { supabase } from '../lib/supabase'
import { Shell } from '../components/Shell'
import { Login } from '../components/Login'
import { Logo } from '../components/Logo'
import { Button, Failed } from '../components/ui'

export const Route = createRootRoute({ component: Root, notFoundComponent: NotFound })

function Root() {
  const { session, ready } = useAuth()
  const me = useMe()
  if (!ready || (session && me.isPending)) return <Splash />
  if (!session) return <Login />
  if (me.isError) return <div className="mx-auto max-w-md p-6"><Failed error={me.error} retry={() => me.refetch()} /></div>
  if (!me.data) return <NoAccount email={session.user.email ?? ''} />
  return <Shell><Outlet /></Shell>
}

/** Below 400 ms a splash is a flash, so it does not render at all. */
function Splash() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 400)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  return (
    <div className="fade-in grid min-h-dvh place-items-center" role="status">
      <div className="flex flex-col items-center gap-4">
        <Logo className="size-12" />
        <p className="text-sm text-ink-2">Opening the ledger</p>
      </div>
    </div>
  )
}

function NoAccount({ email }: { email: string }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm text-center">
        <Logo className="mx-auto mb-5 size-12" />
        <h1 className="text-xl font-semibold">No society account for {email}</h1>
        <p className="mt-2 text-sm text-ink-2">Your committee adds residents. Ask them to add this email.</p>
        <Button className="mt-6" onClick={() => supabase.auth.signOut()}>Use another email</Button>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-semibold">Nothing here</p>
      <a href="/" className="mt-2 inline-block text-sm text-accent">Back home</a>
    </div>
  )
}
