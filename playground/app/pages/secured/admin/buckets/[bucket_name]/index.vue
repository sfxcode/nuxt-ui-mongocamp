<script setup>
const route = useRoute()
const bucketName = route.params.bucket_name
</script>

<template>
  <div class="flex flex-col gap-8 p-4">
    <h2 class="text-xl font-semibold">
      {{ bucketName }}
    </h2>
    <MongocampBucketFiles :bucket-name="bucketName" />
  </div>
</template>
