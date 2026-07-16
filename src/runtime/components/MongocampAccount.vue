<script setup lang='ts'>
import { reactive, ref, resolveComponent } from 'vue'
import { useI18n, useMongocampAccount, useToast } from '#imports'
import type { UserProfile } from '@sfxcode/nuxt-mongocamp-server'

const { t } = useI18n()
const { fetchProfile, changePassword, regenerateApiKey } = useMongocampAccount()
const toast = useToast()

const UBadge = resolveComponent('UBadge')

const profile = ref<UserProfile | null>(null)
const loading = ref(false)

async function loadProfile() {
  loading.value = true
  try {
    profile.value = await fetchProfile()
  }
  finally {
    loading.value = false
  }
}

const passwordData = ref({ password: '' })

const passwordSchema = reactive([
  {
    $formkit: 'nuxtUIInput',
    name: 'password',
    label: t('nuxtUiMongocamp.account.newPassword'),
    inputType: 'password',
    validation: 'required|length:3',
  },
])

async function handleChangePassword() {
  const success = await changePassword(passwordData.value.password)
  if (success) {
    passwordData.value = { password: '' }
  }
}

const isRegenerateModalOpen = ref(false)
const newApiKey = ref<string | null>(null)

function openRegenerateModal() {
  isRegenerateModalOpen.value = true
}

function closeRegenerateModal() {
  isRegenerateModalOpen.value = false
}

async function handleRegenerateApiKey() {
  newApiKey.value = await regenerateApiKey()
  isRegenerateModalOpen.value = false
}

async function copyApiKey() {
  if (!newApiKey.value) return
  await navigator.clipboard.writeText(newApiKey.value)
  toast.add({ title: t('nuxtUiMongocamp.account.copiedTitle'), description: t('nuxtUiMongocamp.account.copiedDescription'), color: 'success' })
}

function dismissApiKey() {
  newApiKey.value = null
}

loadProfile()
</script>

<template>
  <div class="flex flex-col gap-4">
    <USkeleton
      v-if="loading"
      class="h-32 w-full"
    />

    <UCard v-else-if="profile">
      <template #header>
        <span class="font-semibold">{{ t('nuxtUiMongocamp.account.heading') }}</span>
      </template>
      <div class="flex flex-col gap-3">
        <div>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('nuxtUiMongocamp.account.user') }}
          </div>
          <div class="text-lg font-medium">
            {{ profile.user }}
          </div>
        </div>
        <div>
          <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">
            {{ t('nuxtUiMongocamp.account.role') }}
          </div>
          <UBadge
            :label="profile.isAdmin ? t('nuxtUiMongocamp.common.admin') : t('nuxtUiMongocamp.common.standard')"
            :color="profile.isAdmin ? 'error' : 'neutral'"
            variant="subtle"
          />
        </div>
        <div>
          <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">
            {{ t('nuxtUiMongocamp.account.roles') }}
          </div>
          <div
            v-if="profile.roles?.length"
            class="flex flex-wrap gap-1"
          >
            <UBadge
              v-for="role in profile.roles"
              :key="role"
              :label="role"
              color="primary"
              variant="subtle"
            />
          </div>
          <span
            v-else
            class="text-dimmed"
          >—</span>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-semibold">{{ t('nuxtUiMongocamp.account.changePasswordHeading') }}</span>
      </template>
      <FUDataEdit
        :data="passwordData"
        :schema="passwordSchema"
        :submit-label="t('nuxtUiMongocamp.account.changePassword')"
        submit-icon="i-lucide-save"
        @data-saved="handleChangePassword"
      />
    </UCard>

    <UCard>
      <template #header>
        <span class="font-semibold">{{ t('nuxtUiMongocamp.account.apiKeyHeading') }}</span>
      </template>
      <div
        v-if="newApiKey"
        class="flex flex-col gap-2"
      >
        <p class="text-sm text-warning-500">
          {{ t('nuxtUiMongocamp.account.apiKeyOnceWarning') }}
        </p>
        <div class="flex items-center gap-2">
          <UInput
            :model-value="newApiKey"
            readonly
            class="flex-1 font-mono text-xs"
          />
          <UButton
            icon="i-lucide-copy"
            :label="t('nuxtUiMongocamp.common.copy')"
            color="neutral"
            variant="subtle"
            @click="copyApiKey"
          />
        </div>
        <UButton
          :label="t('nuxtUiMongocamp.common.dismiss')"
          color="neutral"
          variant="ghost"
          class="self-start"
          @click="dismissApiKey"
        />
      </div>
      <div
        v-else
        class="flex items-center justify-between gap-4"
      >
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('nuxtUiMongocamp.account.regenerateWarning') }}
        </p>
        <UButton
          :label="t('nuxtUiMongocamp.account.regenerateApiKey')"
          color="error"
          variant="subtle"
          icon="i-lucide-key-round"
          @click="openRegenerateModal"
        />
      </div>
    </UCard>

    <UModal
      v-model:open="isRegenerateModalOpen"
      :title="t('nuxtUiMongocamp.account.regenerateApiKey')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>{{ t('nuxtUiMongocamp.account.confirmRegenerate') }}</p>
      </template>
      <template #footer>
        <UButton
          :label="t('nuxtUiMongocamp.common.cancel')"
          color="neutral"
          variant="ghost"
          @click="closeRegenerateModal"
        />
        <UButton
          :label="t('nuxtUiMongocamp.account.regenerate')"
          color="error"
          icon="i-lucide-key-round"
          @click="handleRegenerateApiKey"
        />
      </template>
    </UModal>
  </div>
</template>
