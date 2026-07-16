import { ref } from 'vue'
import { useMongocampClientApi, useToast } from '#imports'
import type { UserProfile } from '@sfxcode/nuxt-mongocamp-server'

export function useMongocampAccount() {
  const { authApi } = useMongocampClientApi()
  const toast = useToast()

  const changingPassword = ref(false)

  async function fetchProfile(): Promise<UserProfile> {
    return authApi.userProfile()
  }

  async function changePassword(password: string): Promise<boolean> {
    changingPassword.value = true
    try {
      const result = await authApi.updatePassword({ passwordUpdateRequest: { password } })
      toast.add({ title: 'Password changed', description: 'Your password was updated.', color: 'success' })
      return result.value
    }
    catch {
      toast.add({ title: 'Change failed', description: 'Could not change your password.', color: 'error' })
      return false
    }
    finally {
      changingPassword.value = false
    }
  }

  async function regenerateApiKey(): Promise<string> {
    const result = await authApi.generateNewApiKey()
    return result.value
  }

  return { changingPassword, fetchProfile, changePassword, regenerateApiKey }
}
