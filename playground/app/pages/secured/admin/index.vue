<script setup>
</script>

<template>
  <div class="flex flex-col gap-8 p-4">
    <h1 class="text-2xl font-semibold">
      Admin
    </h1>
    <div class="flex gap-4">
      <UButton
        label="Users"
        icon="i-lucide-users"
        to="/secured/admin/users"
        variant="outline"
        size="lg"
      />
      <UButton
        label="Roles"
        icon="i-lucide-shield"
        to="/secured/admin/roles"
        variant="outline"
        size="lg"
      />
      <UButton
        label="Collections"
        icon="i-lucide-database"
        to="/secured/admin/collections"
        variant="outline"
        size="lg"
      />
    </div>
  </div>
</template>
