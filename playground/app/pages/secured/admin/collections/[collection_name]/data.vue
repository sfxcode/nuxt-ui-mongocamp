<script setup>
const route = useRoute()
const collectionName = route.params.collection_name

definePageMeta({ layout: 'collection' })
</script>

<template>
  <div class="flex flex-col gap-8 p-4">
    <CollectionTabs :collection-name="collectionName" />
    <MongocampCollectionData
      :collection-name="collectionName"
      aggregate-path="/secured/admin/collections"
    />
  </div>
</template>
