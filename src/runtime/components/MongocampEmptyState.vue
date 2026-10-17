<script setup lang='ts'>
import { useI18n } from '#imports'

defineProps<{
  icon?: string
  title?: string
  description?: string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col items-center gap-2 py-8 text-center">
    <UIcon
      :name="icon ?? 'i-lucide-inbox'"
      class="size-8 text-dimmed"
    />
    <p class="font-medium">
      {{ title ?? t('nuxtUiMongocamp.empty.title') }}
    </p>
    <p
      v-if="description"
      class="text-sm text-dimmed"
    >
      {{ description }}
    </p>
    <slot />
  </div>
</template>
