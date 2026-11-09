<script setup>
const route = useRoute()
const collectionName = route.params.collection_name
// the data page links here with the Lucene filter of its table
const filter = typeof route.query.filter === 'string' && route.query.filter !== '' ? route.query.filter : undefined

definePageMeta({ layout: 'collection' })
</script>

<template>
  <div class="flex flex-col gap-8 p-4">
    <CollectionTabs :collection-name="collectionName" />
    <MongocampAggregationBuilder
      :collection-name="collectionName"
      :filter="filter"
    />
  </div>
</template>
