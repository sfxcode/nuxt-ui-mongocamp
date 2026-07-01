import { ref } from 'vue'
import { useMongocampApi, useToast } from '#imports'

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
  const { fileApi } = useMongocampApi()
  const toast = useToast()

  const downloadingFileIds = ref<Set<string>>(new Set())
  const uploading = ref(false)

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

  return { isBucketCollection, bucketNameFor, fileIdForRow, downloadingFileIds, uploading, downloadFile, uploadFile }
}
