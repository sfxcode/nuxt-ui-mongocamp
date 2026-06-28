<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMongocampApi } from '#imports'
import type { CollectionStatus } from '@sfxcode/nuxt-mongocamp-server'

const props = defineProps<{
  collectionName: string
}>()

const { collectionApi } = useMongocampApi()

const info = ref<CollectionStatus | null>(null)
const loading = ref(false)

async function fetchInfo() {
  if (!props.collectionName) return
  loading.value = true
  try {
    info.value = await collectionApi.getCollectionInformation({ collectionName: props.collectionName })
  }
  finally {
    loading.value = false
  }
}

watch(() => props.collectionName, fetchInfo, { immediate: true })
</script>

<template>
  <div class="flex flex-col gap-4">
    <USkeleton
      v-if="loading"
      class="h-32 w-full"
    />
    <div
      v-else-if="info"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Documents
        </div>
        <div class="text-2xl font-semibold">
          {{ info.count }}
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Data Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.size / 1024) }} KB
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Storage Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.storageSize / 1024) }} KB
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Avg Doc Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.avgObjSize) }} B
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Indexes
        </div>
        <div class="text-2xl font-semibold">
          {{ info.nindexes }}
        </div>
      </UCard>
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Index Size
        </div>
        <div class="text-2xl font-semibold">
          {{ Math.round(info.totalIndexSize / 1024) }} KB
        </div>
      </UCard>
    </div>
    <div
      v-if="info && info.indexSizes && Object.keys(info.indexSizes).length"
      class="flex flex-col gap-2"
    >
      <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">
        Index Sizes
      </h3>
      <UTable
        :data="Object.entries(info.indexSizes).map(([name, size]) => ({ name, sizeKb: Math.round(size / 1024) }))"
        :columns="[{ accessorKey: 'name', header: 'Index' }, { accessorKey: 'sizeKb', header: 'Size (KB)' }]"
      />
    </div>
  </div>
</template>

<style scoped>
</style>
