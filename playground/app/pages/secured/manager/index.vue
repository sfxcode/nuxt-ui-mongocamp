<script setup>
const { isAdmin } = useMongocampRoles()
const state = useMongocampStorage()
const profile = computed(() => state.value?.profile)
const { managerRoles } = useRuntimeConfig().public.nuxtUiMongocampOptions

// the manager's own area: what the role stands for and where it leads (the admin pages stay admin-only)
const reasons = computed(() => {
  if (isAdmin.value) return ['Administrators always count as managers.']
  const held = (profile.value?.roles ?? []).filter(role => (managerRoles ?? []).includes(role))
  return held.map(role => `Your role "${role}" is a manager role.`)
})
</script>

<template>
  <div class="flex flex-col gap-6 py-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-semibold">
          Manager dashboard<span v-if="profile?.user"> · {{ profile.user }}</span>
        </h1>
        <p
          v-for="reason in reasons"
          :key="reason"
          class="text-sm text-gray-500 dark:text-gray-400"
        >
          {{ reason }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <MongocampVersion />
        <UButton
          label="Home"
          icon="i-lucide-home"
          to="/secured"
          color="neutral"
          variant="outline"
        />
        <UButton
          label="Account"
          icon="i-lucide-user"
          to="/secured/account"
          color="neutral"
          variant="outline"
        />
      </div>
    </div>

    <UserAccess v-if="!isAdmin" />
    <UAlert
      v-else
      color="info"
      variant="subtle"
      icon="i-lucide-shield"
      title="You are an administrator"
      description="Administrators may access every collection. See the admin pages for the full overview."
    >
      <template #actions>
        <UButton
          label="Admin overview"
          to="/secured/admin/overview"
          color="neutral"
          variant="outline"
        />
      </template>
    </UAlert>
  </div>
</template>
