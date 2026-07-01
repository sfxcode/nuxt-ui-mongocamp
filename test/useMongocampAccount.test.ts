import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuthApi = {
  userProfile: vi.fn(),
  updatePassword: vi.fn(),
  generateNewApiKey: vi.fn(),
}

const mockToastAdd = vi.fn()

vi.mock('#imports', () => ({
  useMongocampApi: () => ({ authApi: mockAuthApi }),
  useToast: () => ({ add: mockToastAdd }),
}))

const { useMongocampAccount } = await import('../src/runtime/composables/useMongocampAccount')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchProfile', () => {
  it('calls authApi.userProfile with no arguments and returns the profile', async () => {
    const profile = { user: 'alice', isAdmin: false }
    mockAuthApi.userProfile.mockResolvedValueOnce(profile)

    const { fetchProfile } = useMongocampAccount()
    const result = await fetchProfile()

    expect(mockAuthApi.userProfile).toHaveBeenCalledWith()
    expect(result).toBe(profile)
  })
})

describe('changePassword', () => {
  it('nests the password under passwordUpdateRequest, tracks loading, and shows a success toast', async () => {
    mockAuthApi.updatePassword.mockResolvedValueOnce({ value: true })

    const { changePassword, changingPassword } = useMongocampAccount()
    const promise = changePassword('new-password')
    expect(changingPassword.value).toBe(true)
    const result = await promise

    expect(mockAuthApi.updatePassword).toHaveBeenCalledWith({ passwordUpdateRequest: { password: 'new-password' } })
    expect(result).toBe(true)
    expect(changingPassword.value).toBe(false)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('shows an error toast, clears loading state and returns false when the call fails', async () => {
    mockAuthApi.updatePassword.mockRejectedValueOnce(new Error('boom'))

    const { changePassword, changingPassword } = useMongocampAccount()
    const result = await changePassword('new-password')

    expect(result).toBe(false)
    expect(changingPassword.value).toBe(false)
    expect(mockToastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
})

describe('regenerateApiKey', () => {
  it('calls authApi.generateNewApiKey with no arguments and returns the new key', async () => {
    mockAuthApi.generateNewApiKey.mockResolvedValueOnce({ value: 'new-api-key' })

    const { regenerateApiKey } = useMongocampAccount()
    const result = await regenerateApiKey()

    expect(mockAuthApi.generateNewApiKey).toHaveBeenCalledWith()
    expect(result).toBe('new-api-key')
  })
})
