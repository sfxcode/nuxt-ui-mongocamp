<script setup>
const route = useRoute()
const collectionName = route.params.collection_name
</script>

<template>
  <div class="flex flex-col gap-8 p-4">
    <h2 class="text-xl font-semibold">
      {{ collectionName }}
    </h2>
    <MongocampCollectionData :collection-name="collectionName" />
  </div>
</template>
