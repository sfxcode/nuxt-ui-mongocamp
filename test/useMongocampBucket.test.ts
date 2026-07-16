import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFileApi = {
  getFileInformation: vi.fn(),
  getFile: vi.fn(),
  insertFile: vi.fn(),
  listFilesRaw: vi.fn(),
  deleteFile: vi.fn(),
  updateFileInformation: vi.fn(),
}

const mockBucketApi = {
  listBuckets: vi.fn(),
  getBucket: vi.fn(),
  clearBucket: vi.fn(),
  deleteBucket: vi.fn(),
}

const mockToastAdd = vi.fn()

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ fileApi: mockFileApi, bucketApi: mockBucketApi }),
  useToast: () => ({ add: mockToastAdd }),
}))

const { useMongocampBucket } = await import('../src/runtime/composables/useMongocampBucket')

function stubDom() {
  const anchor = { click: vi.fn(), href: '', download: '' }
  const appendChild = vi.fn()
  const removeChild = vi.fn()
  vi.stubGlobal('document', {
    createElement: vi.fn(() => anchor),
    body: { appendChild, removeChild },
  })
  return { anchor, appendChild, removeChild }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('isBucketCollection', () => {
  const { isBucketCollection } = useMongocampBucket()

  it('returns true for a .files collection', () => {
    expect(isBucketCollection('test_images.files')).toBe(true)
  })

  it('returns true for a .chunks collection', () => {
    expect(isBucketCollection('test_images.chunks')).toBe(true)
  })

  it('returns false for a regular collection', () => {
    expect(isBucketCollection('test_customer')).toBe(false)
  })
})

describe('bucketNameFor', () => {
  const { bucketNameFor } = useMongocampBucket()

  it('strips the .files suffix', () => {
    expect(bucketNameFor('test_images.files')).toBe('test_images')
  })

  it('strips the .chunks suffix', () => {
    expect(bucketNameFor('test_images.chunks')).toBe('test_images')
  })

  it('returns the name unchanged when there is no bucket suffix', () => {
    expect(bucketNameFor('test_customer')).toBe('test_customer')
  })
})

describe('fileIdForRow', () => {
  const { fileIdForRow } = useMongocampBucket()

  it('reads _id for a .files collection', () => {
    expect(fileIdForRow('test_images.files', { _id: 'abc' })).toBe('abc')
  })

  it('unwraps an extended-JSON $oid _id for a .files collection', () => {
    expect(fileIdForRow('test_images.files', { _id: { $oid: 'abc123' } })).toBe('abc123')
  })

  it('reads files_id (not _id) for a .chunks collection', () => {
    expect(fileIdForRow('test_images.chunks', { files_id: 'abc', _id: 'chunk-id' })).toBe('abc')
  })

  it('unwraps an extended-JSON $oid files_id for a .chunks collection', () => {
    expect(fileIdForRow('test_images.chunks', { files_id: { $oid: 'abc123' } })).toBe('abc123')
  })

  it('returns undefined when the expected id field is missing', () => {
    expect(fileIdForRow('test_images.chunks', { _id: 'abc' })).toBeUndefined()
  })
})

describe('downloadFile', () => {
  it('fetches file info and blob, then triggers a browser download', async () => {
    const { anchor, appendChild, removeChild } = stubDom()
    mockFileApi.getFileInformation.mockResolvedValueOnce({ filename: 'photo.png' })
    mockFileApi.getFile.mockResolvedValueOnce(new Blob(['data']))

    const { downloadFile, downloadingFileIds } = useMongocampBucket()
    const promise = downloadFile('test_images.files', 'file-1')
    expect(downloadingFileIds.value.has('file-1')).toBe(true)
    await promise

    expect(mockFileApi.getFileInformation).toHaveBeenCalledWith({ bucketName: 'test_images', fileId: 'file-1' })
    expect(mockFileApi.getFile).toHaveBeenCalledWith({ bucketName: 'test_images', fileId: 'file-1' })
    expect(anchor.download).toBe('photo.png')
    expect(anchor.click).toHaveBeenCalledOnce()
    expect(appendChild).toHaveBeenCalledOnce()
    expect(removeChild).toHaveBeenCalledOnce()
    expect(downloadingFileIds.value.has('file-1')).toBe(false)
  })

  it('falls back to the file id as the download name when no filename is known', async () => {
    const { anchor } = stubDom()
    mockFileApi.getFileInformation.mockResolvedValueOnce({ filename: '' })
    mockFileApi.getFile.mockResolvedValueOnce(new Blob(['data']))

    const { downloadFile } = useMongocampBucket()
    await downloadFile('test_images.files', 'file-1')

    expect(anchor.download).toBe('file-1')
  })

  it('shows an error toast and clears loading state when the API call fails', async () => {
    stubDom()
    mockFileApi.getFileInformation.mockRejectedValueOnce(new Error('boom'))

    const { downloadFile, downloadingFileIds } = useMongocampBucket()
    await downloadFile('test_images.files', 'file-1')

    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    expect(downloadingFileIds.value.has('file-1')).toBe(false)
  })
})

describe('uploadFile', () => {
  it('uploads via fileApi.insertFile, shows a success toast and returns true', async () => {
    mockFileApi.insertFile.mockResolvedValueOnce({})
    const file = new File(['data'], 'photo.png', { type: 'image/png' })

    const { uploadFile, uploading } = useMongocampBucket()
    const promise = uploadFile('test_images.files', file)
    expect(uploading.value).toBe(true)
    const result = await promise

    expect(result).toBe(true)
    expect(uploading.value).toBe(false)
    expect(mockFileApi.insertFile).toHaveBeenCalledWith({
      bucketName: 'test_images',
      file,
      fileName: 'photo.png',
      metaData: '{}',
    })
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('resolves the bucket name from a .chunks collection too', async () => {
    mockFileApi.insertFile.mockResolvedValueOnce({})
    const file = new File(['data'], 'photo.png')

    const { uploadFile } = useMongocampBucket()
    await uploadFile('test_images.chunks', file)

    expect(mockFileApi.insertFile).toHaveBeenCalledWith(expect.objectContaining({ bucketName: 'test_images' }))
  })

  it('shows an error toast, clears loading state and returns false when upload fails', async () => {
    mockFileApi.insertFile.mockRejectedValueOnce(new Error('boom'))
    const file = new File(['data'], 'photo.png')

    const { uploadFile, uploading } = useMongocampBucket()
    const result = await uploadFile('test_images.files', file)

    expect(result).toBe(false)
    expect(uploading.value).toBe(false)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
})

function mockRawResponse<T>(value: T, totalHeader?: string) {
  return {
    raw: { headers: { get: (name: string) => (name === 'x-pagination-count-rows' ? (totalHeader ?? null) : null) } },
    value: () => Promise.resolve(value),
  }
}

describe('listFiles', () => {
  it('passes bucketName and every option through, and returns files + total from the raw response', async () => {
    const files = [{ id: 'f1', filename: 'a.png', length: 10, chunkSize: 1, uploadDate: new Date(), metadata: {} }]
    mockFileApi.listFilesRaw.mockResolvedValueOnce(mockRawResponse(files, '7'))

    const { listFiles } = useMongocampBucket()
    const result = await listFiles('test_images', { filter: 'filename:*.png', sort: '-uploadDate', projection: 'filename', page: 2, rowsPerPage: 10 })

    expect(mockFileApi.listFilesRaw).toHaveBeenCalledWith({
      bucketName: 'test_images',
      filter: 'filename:*.png',
      sort: '-uploadDate',
      projection: 'filename',
      page: 2,
      rowsPerPage: 10,
    })
    expect(result).toEqual({ files, total: 7 })
  })

  it('defaults every option to undefined when omitted', async () => {
    mockFileApi.listFilesRaw.mockResolvedValueOnce(mockRawResponse([], '0'))

    const { listFiles } = useMongocampBucket()
    await listFiles('test_images')

    expect(mockFileApi.listFilesRaw).toHaveBeenCalledWith({
      bucketName: 'test_images',
      filter: undefined,
      sort: undefined,
      projection: undefined,
      page: undefined,
      rowsPerPage: undefined,
    })
  })

  it('defaults total to 0 when the pagination header is missing', async () => {
    mockFileApi.listFilesRaw.mockResolvedValueOnce(mockRawResponse([]))

    const { listFiles } = useMongocampBucket()
    const result = await listFiles('test_images')

    expect(result.total).toBe(0)
  })
})

describe('deleteFile', () => {
  it('tracks in-flight state, shows a success toast, and returns wasAcknowledged', async () => {
    mockFileApi.deleteFile.mockResolvedValueOnce({ wasAcknowledged: true, deletedCount: 1 })

    const { deleteFile, fileActionInFlight } = useMongocampBucket()
    const promise = deleteFile('test_images', 'file-1')
    expect(fileActionInFlight.value.has('file-1')).toBe(true)
    const result = await promise

    expect(mockFileApi.deleteFile).toHaveBeenCalledWith({ bucketName: 'test_images', fileId: 'file-1' })
    expect(result).toBe(true)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
    expect(fileActionInFlight.value.has('file-1')).toBe(false)
  })

  it('shows an error toast, clears in-flight state and returns false when the call fails', async () => {
    mockFileApi.deleteFile.mockRejectedValueOnce(new Error('boom'))

    const { deleteFile, fileActionInFlight } = useMongocampBucket()
    const result = await deleteFile('test_images', 'file-1')

    expect(result).toBe(false)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    expect(fileActionInFlight.value.has('file-1')).toBe(false)
  })
})

describe('updateFileInformation', () => {
  it('nests filename/metadata under updateFileInformationRequest, shows a success toast, and returns wasAcknowledged', async () => {
    mockFileApi.updateFileInformation.mockResolvedValueOnce({ wasAcknowledged: true, modifiedCount: 1, matchedCount: 1 })

    const { updateFileInformation, fileActionInFlight } = useMongocampBucket()
    const promise = updateFileInformation('test_images', 'file-1', { filename: 'renamed.png', metadata: { owner: 'alice' } })
    expect(fileActionInFlight.value.has('file-1')).toBe(true)
    const result = await promise

    expect(mockFileApi.updateFileInformation).toHaveBeenCalledWith({
      bucketName: 'test_images',
      fileId: 'file-1',
      updateFileInformationRequest: { filename: 'renamed.png', metadata: { owner: 'alice' } },
    })
    expect(result).toBe(true)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
    expect(fileActionInFlight.value.has('file-1')).toBe(false)
  })

  it('shows an error toast, clears in-flight state and returns false when the call fails', async () => {
    mockFileApi.updateFileInformation.mockRejectedValueOnce(new Error('boom'))

    const { updateFileInformation, fileActionInFlight } = useMongocampBucket()
    const result = await updateFileInformation('test_images', 'file-1', { filename: 'renamed.png' })

    expect(result).toBe(false)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    expect(fileActionInFlight.value.has('file-1')).toBe(false)
  })
})

describe('listBuckets', () => {
  it('passes through the bucket name list', async () => {
    mockBucketApi.listBuckets.mockResolvedValueOnce(['test_images', 'test_docs'])

    const { listBuckets } = useMongocampBucket()
    const result = await listBuckets()

    expect(mockBucketApi.listBuckets).toHaveBeenCalledWith()
    expect(result).toEqual(['test_images', 'test_docs'])
  })
})

describe('getBucketInfo', () => {
  it('calls bucketApi.getBucket with the bucket name', async () => {
    const info = { name: 'test_images', files: 3, size: 1024, avgObjectSize: 341 }
    mockBucketApi.getBucket.mockResolvedValueOnce(info)

    const { getBucketInfo } = useMongocampBucket()
    const result = await getBucketInfo('test_images')

    expect(mockBucketApi.getBucket).toHaveBeenCalledWith({ bucketName: 'test_images' })
    expect(result).toBe(info)
  })
})

describe('clearBucket', () => {
  it('tracks in-flight state, shows a success toast, and returns the API boolean', async () => {
    mockBucketApi.clearBucket.mockResolvedValueOnce({ value: true })

    const { clearBucket, bucketActionInFlight } = useMongocampBucket()
    const promise = clearBucket('test_images')
    expect(bucketActionInFlight.value.has('test_images')).toBe(true)
    const result = await promise

    expect(mockBucketApi.clearBucket).toHaveBeenCalledWith({ bucketName: 'test_images' })
    expect(result).toBe(true)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
    expect(bucketActionInFlight.value.has('test_images')).toBe(false)
  })

  it('shows an error toast, clears in-flight state and returns false when the call fails', async () => {
    mockBucketApi.clearBucket.mockRejectedValueOnce(new Error('boom'))

    const { clearBucket, bucketActionInFlight } = useMongocampBucket()
    const result = await clearBucket('test_images')

    expect(result).toBe(false)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    expect(bucketActionInFlight.value.has('test_images')).toBe(false)
  })
})

describe('deleteBucket', () => {
  it('tracks in-flight state, shows a success toast, and returns the API boolean', async () => {
    mockBucketApi.deleteBucket.mockResolvedValueOnce({ value: true })

    const { deleteBucket, bucketActionInFlight } = useMongocampBucket()
    const promise = deleteBucket('test_images')
    expect(bucketActionInFlight.value.has('test_images')).toBe(true)
    const result = await promise

    expect(mockBucketApi.deleteBucket).toHaveBeenCalledWith({ bucketName: 'test_images' })
    expect(result).toBe(true)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
    expect(bucketActionInFlight.value.has('test_images')).toBe(false)
  })

  it('shows an error toast, clears in-flight state and returns false when the call fails', async () => {
    mockBucketApi.deleteBucket.mockRejectedValueOnce(new Error('boom'))

    const { deleteBucket, bucketActionInFlight } = useMongocampBucket()
    const result = await deleteBucket('test_images')

    expect(result).toBe(false)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    expect(bucketActionInFlight.value.has('test_images')).toBe(false)
  })
})
