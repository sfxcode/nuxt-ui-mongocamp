<script setup>
const route = useRoute()
const collectionName = route.params.collection_name
</script>

<template>
  <div class="flex flex-col gap-8 p-4">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-xl font-semibold">
        {{ collectionName }}
      </h2>
      <UButton
        :to="`/secured/admin/collections/${collectionName}/aggregate`"
        icon="i-lucide-sigma"
        color="neutral"
        variant="ghost"
        label="Aggregate"
      />
    </div>
    <MongocampCollectionInfos :collection-name="collectionName" />
  </div>
</template>
