<script setup lang='ts'>
import { reactive, ref, resolveComponent } from 'vue'
import { useMongocampAccount, useToast } from '#imports'
import type { UserProfile } from '@sfxcode/nuxt-mongocamp-server'

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
    label: 'New Password',
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
  toast.add({ title: 'Copied to clipboard', description: 'API key copied.', color: 'success' })
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
        <span class="font-semibold">Account</span>
      </template>
      <div class="flex flex-col gap-3">
        <div>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            User
          </div>
          <div class="text-lg font-medium">
            {{ profile.user }}
          </div>
        </div>
        <div>
          <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Role
          </div>
          <UBadge
            :label="profile.isAdmin ? 'Admin' : 'Standard'"
            :color="profile.isAdmin ? 'error' : 'neutral'"
            variant="subtle"
          />
        </div>
        <div>
          <div class="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Roles
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
        <span class="font-semibold">Change Password</span>
      </template>
      <FUDataEdit
        :data="passwordData"
        :schema="passwordSchema"
        submit-label="Change Password"
        submit-icon="i-lucide-save"
        @data-saved="handleChangePassword"
      />
    </UCard>

    <UCard>
      <template #header>
        <span class="font-semibold">API Key</span>
      </template>
      <div
        v-if="newApiKey"
        class="flex flex-col gap-2"
      >
        <p class="text-sm text-warning-500">
          This key is shown only once. Copy it now — it cannot be retrieved again.
        </p>
        <div class="flex items-center gap-2">
          <UInput
            :model-value="newApiKey"
            readonly
            class="flex-1 font-mono text-xs"
          />
          <UButton
            icon="i-lucide-copy"
            label="Copy"
            color="neutral"
            variant="subtle"
            @click="copyApiKey"
          />
        </div>
        <UButton
          label="Dismiss"
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
          Regenerating your API key immediately invalidates the current one.
        </p>
        <UButton
          label="Regenerate API Key"
          color="error"
          variant="subtle"
          icon="i-lucide-key-round"
          @click="openRegenerateModal"
        />
      </div>
    </UCard>

    <UModal
      v-model:open="isRegenerateModalOpen"
      title="Regenerate API Key"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p>Are you sure you want to regenerate your API key? Your current key will stop working immediately.</p>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="closeRegenerateModal"
        />
        <UButton
          label="Regenerate"
          color="error"
          icon="i-lucide-key-round"
          @click="handleRegenerateApiKey"
        />
      </template>
    </UModal>
  </div>
</template>
