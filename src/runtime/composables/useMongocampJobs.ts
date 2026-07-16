import { useMongocampClientApi } from '#imports'
import type { JobConfig, JobInformation } from '@sfxcode/nuxt-mongocamp-server'

export function useMongocampJobs() {
  const { jobApi } = useMongocampClientApi()

  async function listJobs(): Promise<JobInformation[]> {
    return jobApi.jobsList()
  }

  async function listPossibleJobs(): Promise<string[]> {
    return jobApi.possibleJobsList()
  }

  async function registerJob(jobConfig: JobConfig): Promise<JobInformation> {
    return jobApi.registerJob({ jobConfig })
  }

  async function updateJob(jobGroup: string, jobName: string, jobConfig: JobConfig): Promise<JobInformation> {
    return jobApi.updateJob({ jobGroup, jobName, jobConfig })
  }

  async function executeJob(jobGroup: string, jobName: string): Promise<boolean> {
    const result = await jobApi.executeJob({ jobGroup, jobName })
    return result.value
  }

  async function deleteJob(jobGroup: string, jobName: string): Promise<boolean> {
    const result = await jobApi.deleteJob({ jobGroup, jobName })
    return result.value
  }

  return { listJobs, listPossibleJobs, registerJob, updateJob, executeJob, deleteJob }
}
