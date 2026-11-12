import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from './supabase'
import { parse } from './parse'
import { adoptExponent } from './money'
import { me as meParser } from './rows'
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
    queryFn: async () => {
      const data = parse(meParser, unwrap(await supabase.rpc('api_me', {})), 'useMe')
      /*
       * The server states the currency's minor-unit exponent and a client
       * formats with it rather than deriving its own, because two derivations
       * of one exponent agree on the common cases and diverge where nobody is
       * looking. Adopted here, at the only read that carries the society, and
       * before any amount can be formatted from this payload.
       *
       * The decision itself is adoptExponent in lib/money.ts, not inline: a
       * rule in a hook cannot be tested without a router.
       */
      if (data) adoptExponent(data.society)
      return data
    },
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

/*
 * isOfficer is 0004's `pair` tier and now lives in lib/pending.ts, beside
 * waitsOn, which spelled the same rule out inline while this copy went
 * unused. Re-exported so an import from here still resolves, and because a
 * pure authorisation predicate should not require this module's React,
 * Supabase and TanStack Query import graph to be testable.
 */
export { isOfficer } from './pending'

/** The signed-in person, for screens that render only once it is known. */
export function useMeStrict(): Me {
  const { data } = useMe()
  if (!data) throw new Error('useMeStrict outside the signed-in shell')
  return data
}

/**
 * The society's currency, for a figure whose row does not carry its own.
 * money.ts and <Amount> take the currency as a required argument with no
 * default: a literal 'INR' at a call site is the hardcoded divide-by-100 the
 * money rule forbids, one step removed. A row that carries `currency`
 * (ledger rows, reports, proposals) passes its own instead.
 */
export function useCurrency(): string {
  return useMeStrict().society.currency
}
