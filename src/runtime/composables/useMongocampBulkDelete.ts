import { runBulkDelete } from '../utils/bulkDelete'

export type { BulkDeleteResult } from '../utils/bulkDelete'

export function useMongocampBulkDelete() {
  return { runBulkDelete }
}
