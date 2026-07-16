import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockJobApi = {
  jobsList: vi.fn(),
  possibleJobsList: vi.fn(),
  registerJob: vi.fn(),
  updateJob: vi.fn(),
  executeJob: vi.fn(),
  deleteJob: vi.fn(),
}

vi.mock('#imports', () => ({
  useMongocampClientApi: () => ({ jobApi: mockJobApi }),
}))

const { useMongocampJobs } = await import('../src/runtime/composables/useMongocampJobs')

beforeEach(() => {
  vi.clearAllMocks()
})

const jobConfig = {
  name: 'cleanup',
  className: 'com.example.CleanupJob',
  description: 'Removes stale sessions',
  cronExpression: '0 0 * * * ?',
  group: 'maintenance',
  priority: 5,
}

describe('listJobs', () => {
  it('calls jobApi.jobsList with no arguments', async () => {
    const jobs = [{ name: 'cleanup' }]
    mockJobApi.jobsList.mockResolvedValueOnce(jobs)

    const { listJobs } = useMongocampJobs()
    const result = await listJobs()

    expect(mockJobApi.jobsList).toHaveBeenCalledWith()
    expect(result).toBe(jobs)
  })
})

describe('listPossibleJobs', () => {
  it('calls jobApi.possibleJobsList with no arguments', async () => {
    mockJobApi.possibleJobsList.mockResolvedValueOnce(['com.example.CleanupJob'])

    const { listPossibleJobs } = useMongocampJobs()
    const result = await listPossibleJobs()

    expect(mockJobApi.possibleJobsList).toHaveBeenCalledWith()
    expect(result).toEqual(['com.example.CleanupJob'])
  })
})

describe('registerJob', () => {
  it('passes the jobConfig through unchanged', async () => {
    mockJobApi.registerJob.mockResolvedValueOnce({ ...jobConfig, jobClassName: jobConfig.className })

    const { registerJob } = useMongocampJobs()
    await registerJob(jobConfig)

    expect(mockJobApi.registerJob).toHaveBeenCalledWith({ jobConfig })
  })
})

describe('updateJob', () => {
  it('passes jobGroup, jobName, and jobConfig through unchanged', async () => {
    mockJobApi.updateJob.mockResolvedValueOnce({ ...jobConfig, jobClassName: jobConfig.className })

    const { updateJob } = useMongocampJobs()
    await updateJob('maintenance', 'cleanup', jobConfig)

    expect(mockJobApi.updateJob).toHaveBeenCalledWith({ jobGroup: 'maintenance', jobName: 'cleanup', jobConfig })
  })
})

describe('executeJob', () => {
  it('passes jobGroup and jobName through and unwraps the boolean result', async () => {
    mockJobApi.executeJob.mockResolvedValueOnce({ value: true })

    const { executeJob } = useMongocampJobs()
    const result = await executeJob('maintenance', 'cleanup')

    expect(mockJobApi.executeJob).toHaveBeenCalledWith({ jobGroup: 'maintenance', jobName: 'cleanup' })
    expect(result).toBe(true)
  })
})

describe('deleteJob', () => {
  it('passes jobGroup and jobName through and unwraps the boolean result', async () => {
    mockJobApi.deleteJob.mockResolvedValueOnce({ value: true })

    const { deleteJob } = useMongocampJobs()
    const result = await deleteJob('maintenance', 'cleanup')

    expect(mockJobApi.deleteJob).toHaveBeenCalledWith({ jobGroup: 'maintenance', jobName: 'cleanup' })
    expect(result).toBe(true)
  })
})
