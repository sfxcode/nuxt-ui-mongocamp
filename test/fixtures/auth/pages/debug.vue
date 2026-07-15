<template>
  <div>
    <h1>debug</h1>
    <pre data-test="debug-json">{{ JSON.stringify({
      isLoggedIn,
      isAdmin: storage?.profile?.isAdmin ?? false,
      roles: userRoles,
      user: storage?.profile?.user ?? '',
    }) }}</pre>
  </div>
</template>

<script setup>
const { isLoggedIn, userRoles } = useMongocampAuth()
const storage = useMongocampStorage()
</script>
