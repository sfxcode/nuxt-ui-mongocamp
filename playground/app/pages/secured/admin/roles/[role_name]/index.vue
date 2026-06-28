<script setup>
const route = useRoute()
const roleName = route.params.role_name
</script>

<template>
  <div class="flex flex-col gap-8 p-4">
    <MongocampRoleGrants :role-name="roleName" />
  </div>
</template>
