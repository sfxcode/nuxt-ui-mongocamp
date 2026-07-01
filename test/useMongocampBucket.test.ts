import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFileApi = {
  getFileInformation: vi.fn(),
  getFile: vi.fn(),
  insertFile: vi.fn(),
}

const mockToastAdd = vi.fn()

vi.mock('#imports', () => ({
  useMongocampApi: () => ({ fileApi: mockFileApi }),
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
