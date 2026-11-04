import { ref } from 'vue'
import { useI18n, useMongocampClientApi, useToast } from '#imports'
import type { BucketInformation, FileInformation } from '@sfxcode/nuxt-mongocamp-server'
import { BUCKET_COLLECTION_SUFFIX } from '../utils/collectionProtection'
import { isFilterTooLong, MAX_ENCODED_FILTER_LENGTH } from '../utils/requestLimits'

export interface ListFilesOptions {
  filter?: string
  sort?: string
  projection?: string
  page?: number
  rowsPerPage?: number
}

export interface ListFilesResult {
  files: FileInformation[]
  total: number
}

export interface UpdateFileInformationOptions {
  filename?: string
  metadata?: Record<string, unknown>
}

function unwrapId(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && '$oid' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).$oid)
  }
  return undefined
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function useMongocampBucket() {
  const { t } = useI18n()
  const { fileApi, bucketApi } = useMongocampClientApi()
  const toast = useToast()

  const downloadingFileIds = ref<Set<string>>(new Set())
  const uploading = ref(false)
  const bucketActionInFlight = ref<Set<string>>(new Set())
  const fileActionInFlight = ref<Set<string>>(new Set())

  function isBucketCollection(collectionName: string): boolean {
    return BUCKET_COLLECTION_SUFFIX.test(collectionName)
  }

  function bucketNameFor(collectionName: string): string {
    return collectionName.replace(BUCKET_COLLECTION_SUFFIX, '')
  }

  function fileIdForRow(collectionName: string, row: Record<string, unknown>): string | undefined {
    return collectionName.endsWith('.chunks') ? unwrapId(row.files_id) : unwrapId(row._id)
  }

  async function downloadFile(collectionName: string, fileId: string): Promise<void> {
    const bucketName = bucketNameFor(collectionName)
    downloadingFileIds.value.add(fileId)
    try {
      const info = await fileApi.getFileInformation({ bucketName, fileId })
      const blob = await fileApi.getFile({ bucketName, fileId })
      triggerBrowserDownload(blob, info.filename || fileId)
    }
    catch (e) {
      toast.add({ title: t('nuxtUiMongocamp.bucket.downloadFailedTitle'), description: e instanceof Error ? e.message : t('nuxtUiMongocamp.bucket.downloadFailedFallback'), color: 'error' })
    }
    finally {
      downloadingFileIds.value.delete(fileId)
    }
  }

  async function uploadFile(collectionName: string, file: File): Promise<boolean> {
    const bucketName = bucketNameFor(collectionName)
    uploading.value = true
    try {
      await fileApi.insertFile({ bucketName, file, fileName: file.name, metaData: '{}' })
      toast.add({ title: t('nuxtUiMongocamp.bucket.uploadedTitle'), description: t('nuxtUiMongocamp.bucket.uploadedDescription', { fileName: file.name }), color: 'success' })
      return true
    }
    catch (e) {
      toast.add({ title: t('nuxtUiMongocamp.bucket.uploadFailedTitle'), description: e instanceof Error ? e.message : t('nuxtUiMongocamp.bucket.uploadFailedFallback'), color: 'error' })
      return false
    }
    finally {
      uploading.value = false
    }
  }

  /** The file's bytes without triggering a download (preview); errors are left to the caller. */
  async function fetchFileBlob(bucketName: string, fileId: string): Promise<Blob> {
    return fileApi.getFile({ bucketName, fileId })
  }

  /**
   * Uploads several files one after the other (no toast per file); a failure never stops the rest.
   * `onProgress` fires before each file and after it finished.
   */
  async function uploadFiles(
    bucketName: string,
    files: File[],
    options: { signal?: AbortSignal, onProgress?: (done: number, total: number, current?: string) => void } = {},
  ): Promise<{ uploaded: string[], failed: { name: string, message: string }[], aborted: boolean }> {
    const uploaded: string[] = []
    const failed: { name: string, message: string }[] = []
    let aborted = false
    uploading.value = true
    try {
      for (const [index, file] of files.entries()) {
        if (options.signal?.aborted) {
          aborted = true
          break
        }
        options.onProgress?.(index, files.length, file.name)
        try {
          await fileApi.insertFile({ bucketName, file, fileName: file.name, metaData: '{}' })
          uploaded.push(file.name)
        }
        catch (e) {
          failed.push({ name: file.name, message: e instanceof Error ? e.message : t('nuxtUiMongocamp.bucket.uploadFailedFallback') })
        }
      }
      options.onProgress?.(uploaded.length + failed.length, files.length)
    }
    finally {
      uploading.value = false
    }
    return { uploaded, failed, aborted }
  }

  async function listFiles(bucketName: string, options: ListFilesOptions = {}): Promise<ListFilesResult> {
    // a too-long query string would only come back as an opaque network failure (the server's 414 has no CORS headers)
    if (isFilterTooLong(options.filter)) {
      throw new Error(t('nuxtUiMongocamp.bucket.filterTooLong', { max: MAX_ENCODED_FILTER_LENGTH }))
    }
    const res = await fileApi.listFilesRaw({
      bucketName,
      filter: options.filter,
      sort: options.sort,
      projection: options.projection,
      page: options.page,
      rowsPerPage: options.rowsPerPage,
    })
    const total = +(res.raw.headers.get('x-pagination-count-rows') ?? 0)
    const files = await res.value()
    return { files, total }
  }

  async function deleteFile(bucketName: string, fileId: string): Promise<boolean> {
    fileActionInFlight.value.add(fileId)
    try {
      const result = await fileApi.deleteFile({ bucketName, fileId })
      toast.add({ title: t('nuxtUiMongocamp.bucket.deletedTitle'), description: t('nuxtUiMongocamp.bucket.deletedDescription'), color: 'success' })
      return result.wasAcknowledged
    }
    catch (e) {
      toast.add({ title: t('nuxtUiMongocamp.bucket.deleteFailedTitle'), description: e instanceof Error ? e.message : t('nuxtUiMongocamp.bucket.deleteFailedFallback'), color: 'error' })
      return false
    }
    finally {
      fileActionInFlight.value.delete(fileId)
    }
  }

  async function updateFileInformation(bucketName: string, fileId: string, options: UpdateFileInformationOptions): Promise<boolean> {
    fileActionInFlight.value.add(fileId)
    try {
      const result = await fileApi.updateFileInformation({
        bucketName,
        fileId,
        updateFileInformationRequest: { filename: options.filename, metadata: options.metadata },
      })
      toast.add({ title: t('nuxtUiMongocamp.bucket.updatedTitle'), description: t('nuxtUiMongocamp.bucket.updatedDescription'), color: 'success' })
      return result.wasAcknowledged
    }
    catch (e) {
      toast.add({ title: t('nuxtUiMongocamp.bucket.updateFailedTitle'), description: e instanceof Error ? e.message : t('nuxtUiMongocamp.bucket.updateFailedFallback'), color: 'error' })
      return false
    }
    finally {
      fileActionInFlight.value.delete(fileId)
    }
  }

  async function listBuckets(): Promise<string[]> {
    return bucketApi.listBuckets()
  }

  async function getBucketInfo(bucketName: string): Promise<BucketInformation> {
    return bucketApi.getBucket({ bucketName })
  }

  async function clearBucket(bucketName: string): Promise<boolean> {
    bucketActionInFlight.value.add(bucketName)
    try {
      const result = await bucketApi.clearBucket({ bucketName })
      toast.add({ title: t('nuxtUiMongocamp.bucket.bucketClearedTitle'), description: t('nuxtUiMongocamp.bucket.bucketClearedDescription', { bucketName }), color: 'success' })
      return result.value
    }
    catch (e) {
      toast.add({ title: t('nuxtUiMongocamp.bucket.clearFailedTitle'), description: e instanceof Error ? e.message : t('nuxtUiMongocamp.bucket.clearFailedFallback', { bucketName }), color: 'error' })
      return false
    }
    finally {
      bucketActionInFlight.value.delete(bucketName)
    }
  }

  async function deleteBucket(bucketName: string): Promise<boolean> {
    bucketActionInFlight.value.add(bucketName)
    try {
      const result = await bucketApi.deleteBucket({ bucketName })
      toast.add({ title: t('nuxtUiMongocamp.bucket.bucketDeletedTitle'), description: t('nuxtUiMongocamp.bucket.bucketDeletedDescription', { bucketName }), color: 'success' })
      return result.value
    }
    catch (e) {
      toast.add({ title: t('nuxtUiMongocamp.bucket.deleteFailedTitle'), description: e instanceof Error ? e.message : t('nuxtUiMongocamp.bucket.deleteFailedBucketFallback', { bucketName }), color: 'error' })
      return false
    }
    finally {
      bucketActionInFlight.value.delete(bucketName)
    }
  }

  return {
    isBucketCollection,
    bucketNameFor,
    fileIdForRow,
    downloadingFileIds,
    uploading,
    downloadFile,
    uploadFile,
    uploadFiles,
    fetchFileBlob,
    bucketActionInFlight,
    fileActionInFlight,
    listFiles,
    deleteFile,
    updateFileInformation,
    listBuckets,
    getBucketInfo,
    clearBucket,
    deleteBucket,
  }
}
