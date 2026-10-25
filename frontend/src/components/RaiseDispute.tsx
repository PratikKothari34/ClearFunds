import { useState } from 'react'
import { Eye } from 'lucide-react'
import { useRaiseFlag } from '../lib/api'
import { Refused } from '../lib/supabase'
import { useMeStrict } from '../lib/session'
import { Button, Field, Input, Segmented, Sheet, Textarea, useToast } from './ui'
import { todayIST } from '../lib/format'

type Scope = 'entries' | 'counterparty' | 'period'

/**
 * A dispute has no financial effect. It can cover one entry, a payee, or a
 * month, so forty small entries never cost a resident forty complaints.
 */
export function RaiseDispute({ open, onClose, seq, counterparty }: { open: boolean; onClose: () => void; seq?: number; counterparty?: string | null }) {
  const me = useMeStrict()
  const raise = useRaiseFlag()
  const toast = useToast()
  const [scope, setScope] = useState<Scope>(seq ? 'entries' : 'counterparty')
  const [payee, setPayee] = useState(counterparty ?? '')
  const [period, setPeriod] = useState(todayIST().slice(0, 7))
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    try {
      await raise.mutateAsync({
        scope, text,
        ...(scope === 'entries' ? { target_seqs: [seq!] } : scope === 'counterparty' ? { counterparty: payee } : { period }),
      })
      toast('Dispute raised. It is on the record and cannot be removed.')
      setText('')
      onClose()
    } catch (e) {
      setError(e instanceof Refused ? e.message : 'Could not raise it. Try again.')
    }
  }

  const tenant = me.tenure?.kind === 'tenant'
  return (
    <Sheet open={open} onClose={onClose} title="Raise a dispute"
      footer={<Button tone="primary" className="w-full" busy={raise.isPending} disabled={!text.trim()} onClick={submit}>Raise dispute</Button>}>
      <div className="space-y-5">
        <Segmented<Scope> label="What is it about" value={scope} onChange={setScope}
          options={[
            ...(seq ? [{ value: 'entries' as const, label: `Entry #${seq}` }] : []),
            { value: 'counterparty', label: 'A payee' },
            { value: 'period', label: 'A month' },
          ]} />
        {scope === 'counterparty' && (
          <Field label="Payee" htmlFor="payee"><Input id="payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. Shree Sai Plumbing" /></Field>
        )}
        {scope === 'period' && (
          <Field label="Month" htmlFor="period"><Input id="period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
        )}
        <Field label="What looks wrong?" htmlFor="why" error={error}>
          <Textarea id="why" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Ask a question or state what you think is wrong." />
        </Field>
        <ul className="space-y-2 rounded-2xl bg-sunken p-4 text-[13px] text-ink-2">
          <li>Other residents see a code, not your name. The treasurer, secretary and committee can see who you are.</li>
          <li>Only you can mark it resolved. A reply from the committee does not close it.</li>
          {tenant && (
            <li className="flex gap-2 font-medium text-ink"><Eye className="mt-0.5 size-4 shrink-0" />The owner of your flat can see disputes you raise.</li>
          )}
        </ul>
      </div>
    </Sheet>
  )
}
