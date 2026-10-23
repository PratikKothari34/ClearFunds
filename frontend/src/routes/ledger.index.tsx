import { createFileRoute } from '@tanstack/react-router'
import { LedgerList } from '../components/LedgerList'
import { LedgerSummary } from '../components/LedgerSummary'
import { SAMPLE_LEDGER } from '../lib/sample'

export const Route = createFileRoute('/ledger/')({
  component: LedgerAll,
})

/**
 * The whole history. No filter applied, and the summary line says so.
 *
 * The summary is not decoration: on every other tab it reports how many
 * entries the filter EXCLUDED. A resident who lands on a filtered
 * ledger without being told reads a partial record as the complete one.
 */
function LedgerAll() {
  return (
    <>
      <LedgerSummary shown={SAMPLE_LEDGER.length} total={SAMPLE_LEDGER.length} />
      <LedgerList entries={SAMPLE_LEDGER} />
    </>
  )
}
