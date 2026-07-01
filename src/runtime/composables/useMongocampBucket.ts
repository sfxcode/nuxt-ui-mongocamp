import { ref } from 'vue'
import { useMongocampApi, useToast } from '#imports'
import type { BucketInformation } from '@sfxcode/nuxt-mongocamp-server'

const BUCKET_COLLECTION_SUFFIX = /\.(?:files|chunks)$/

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
  const { fileApi, bucketApi } = useMongocampApi()
  const toast = useToast()

  const downloadingFileIds = ref<Set<string>>(new Set())
  const uploading = ref(false)
  const bucketActionInFlight = ref<Set<string>>(new Set())

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
    catch {
      toast.add({ title: 'Download failed', description: 'Could not download the file.', color: 'error' })
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
      toast.add({ title: 'File uploaded', description: `"${file.name}" was uploaded.`, color: 'success' })
      return true
    }
    catch {
      toast.add({ title: 'Upload failed', description: 'Could not upload the file.', color: 'error' })
      return false
    }
    finally {
      uploading.value = false
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
      toast.add({ title: 'Bucket cleared', description: `All files in "${bucketName}" were deleted.`, color: 'success' })
      return result.value
    }
    catch {
      toast.add({ title: 'Clear failed', description: `Could not clear bucket "${bucketName}".`, color: 'error' })
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
      toast.add({ title: 'Bucket deleted', description: `Bucket "${bucketName}" was deleted.`, color: 'success' })
      return result.value
    }
    catch {
      toast.add({ title: 'Delete failed', description: `Could not delete bucket "${bucketName}".`, color: 'error' })
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
    bucketActionInFlight,
    listBuckets,
    getBucketInfo,
    clearBucket,
    deleteBucket,
  }
}
