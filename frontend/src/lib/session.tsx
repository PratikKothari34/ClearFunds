import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from './supabase'
import type { Me, Role } from './types'

type Auth = { session: Session | null; ready: boolean }
const AuthContext = createContext<Auth>({ session: null, ready: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth>({ session: null, ready: false })
  const qc = useQueryClient()
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth({ session: data.session, ready: true }))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setAuth({ session, ready: true })
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') qc.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [qc])
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export function useMe() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['me', session?.user.id],
    enabled: !!session,
    staleTime: 60_000,
    queryFn: async () => unwrap(await supabase.rpc('api_me', {})) as unknown as Me | null,
  })
}

export type Hat = 'resident' | 'auditor' | Role

/** What this person can do here. Cosmetic: the server refuses the rest. */
export function hats(me: Me): Set<Hat> {
  const h = new Set<Hat>()
  if (me.tenure) h.add('resident')
  if (me.seat) h.add(me.seat.role)
  if (me.auditor_for.length) h.add('auditor')
  return h
}

export const isCommittee = (me: Me) => !!me.seat
export const isOfficer = (me: Me) => me.seat?.role === 'treasurer' || me.seat?.role === 'secretary'

/** The signed-in person, for screens that render only once it is known. */
export function useMeStrict(): Me {
  const { data } = useMe()
  if (!data) throw new Error('useMeStrict outside the signed-in shell')
  return data
}
