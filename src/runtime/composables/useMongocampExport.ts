import { downloadTextFile, rowsToCsv } from '../utils/exportRows'

export function useMongocampExport() {
  return { rowsToCsv, downloadTextFile }
}
