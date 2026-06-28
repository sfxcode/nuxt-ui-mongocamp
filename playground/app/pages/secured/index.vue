<script setup>
import { useAsyncData } from '#app'

const { documentApi } = useMongocampApi()
const { filter, sort, projection, pagination, total } = useMongocampCollection()
pagination.value.pageSize = 2
const { data, refresh } = useAsyncData('mc_roles', () => documentApi.listDocumentsRaw({ collectionName: 'mc_roles', filter: filter.value, sort: sort.value, projection: projection.value, page: pagination.value.pageIndex, rowsPerPage: pagination.value.pageSize }).then((res) => {
  total.value = +(res.raw.headers.get('x-pagination-count-rows') ?? 0)
  return res.value()
}))
</script>

<template>
  <div>
    <UPagination
      v-model:page="pagination.pageIndex"
      :items-per-page="pagination.pageSize"
      :total="total"
      @update:page="refresh"
    />

    <UButton
      label="Refresh"
      @click="refresh"
    />
    <div />

    {{ total }}
    <div />
    <pre v-if="data">{{ data }}</pre>
  </div>
</template>
