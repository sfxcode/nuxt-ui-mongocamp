import { useMongocampStorage } from '#imports'

interface MetaData {
  createdBy: string
  updatedBy: string
  created: string
  updated: string
}

export default () => {
  function ensureMetaData<T extends { metaData?: Partial<MetaData> }>(data: T): T {
    const storage = useMongocampStorage()

    const userId = storage.value?.profile.user ?? ''
    const now = new Date().toISOString()

    if (!data.metaData || !data.metaData.createdBy) {
      data.metaData = { createdBy: userId, updatedBy: userId, created: now, updated: now }
    }
    else {
      data.metaData = { createdBy: data.metaData.createdBy, updatedBy: userId, created: data.metaData.created ?? now, updated: now }
    }
    return data
  }

  function updateFromPartial<T>(obj: T, updates: Partial<T>): T {
    return { ...obj, ...updates }
  }

  return { ensureMetaData, updateFromPartial }
}
