import { ref } from 'vue'
import { useI18n, useMongocampClientApi, useToast } from '#imports'
import type { UserProfile } from '@sfxcode/nuxt-mongocamp-server'

export function useMongocampAccount() {
  const { t } = useI18n()
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
      toast.add({ title: t('nuxtUiMongocamp.account.passwordChangedTitle'), description: t('nuxtUiMongocamp.account.passwordChangedDescription'), color: 'success' })
      return result.value
    }
    catch (e) {
      toast.add({ title: t('nuxtUiMongocamp.account.changeFailedTitle'), description: e instanceof Error ? e.message : t('nuxtUiMongocamp.account.changeFailedFallback'), color: 'error' })
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
