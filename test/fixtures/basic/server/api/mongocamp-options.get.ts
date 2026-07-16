import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

export default defineEventHandler((event) => {
  return useRuntimeConfig(event).public.nuxtUiMongocampOptions
})
