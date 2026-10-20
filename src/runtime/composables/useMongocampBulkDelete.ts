import { runBulkDelete } from '../utils/bulkDelete'

export type { BulkDeleteResult, BulkRemoveMany } from '../utils/bulkDelete'

export function useMongocampBulkDelete() {
  return { runBulkDelete }
}
