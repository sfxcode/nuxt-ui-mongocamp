<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n, useToast } from '#imports'
import { allContainerPaths, buildDocumentTree, defaultExpanded, nodeDisplay, visibleNodes } from '../utils/documentTree'
import type { TreeNode } from '../utils/documentTree'
import { valueToJson } from '../utils/exportDocuments'
import type { PathValueType } from '../utils/documentPaths'

// Read-only view of one document, as a typed tree or as JSON. The document is a row as the data table holds it: plain
// values plus extended-JSON wrappers (`$oid`, `$date`, `$numberLong`), so dates, ids and exact 64-bit integers are
// shown as what they are. Nothing here can change the document.
const props = defineProps<{
  document: Record<string, unknown> | null | undefined
}>()

const emit = defineEmits<{
  copy: [payload: { kind: 'path' | 'value' | 'document', text: string }]
}>()

const mode = defineModel<'tree' | 'json'>('mode', { default: 'tree' })

const { t } = useI18n()
const toast = useToast()

const tree = computed(() => buildDocumentTree(props.document ?? {}))
const expanded = ref<Set<string>>(new Set())
// a new document starts with its own default (small ⇒ two levels open, large ⇒ collapsed)
watch(tree, value => (expanded.value = defaultExpanded(value)), { immediate: true })

const rows = computed(() => visibleNodes(tree.value, expanded.value))
const hasContainers = computed(() => allContainerPaths(tree.value).size > 0)
const allOpen = computed(() => hasContainers.value && expanded.value.size >= allContainerPaths(tree.value).size)
const isLarge = computed(() => tree.value.total > 200)
const jsonText = computed(() => (props.document ? valueToJson(props.document, true) : ''))

const BADGE_COLORS: Record<PathValueType, 'neutral' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error'> = {
  null: 'neutral',
  string: 'neutral',
  boolean: 'success',
  number: 'warning',
  int: 'warning',
  long: 'warning',
  double: 'warning',
  decimal: 'warning',
  objectId: 'info',
  date: 'info',
  array: 'primary',
  object: 'secondary',
}

function toggle(node: TreeNode) {
  const next = new Set(expanded.value)
  if (!next.delete(node.path)) next.add(node.path)
  expanded.value = next
}

function toggleAll() {
  expanded.value = allOpen.value ? new Set() : allContainerPaths(tree.value)
}

async function copy(kind: 'path' | 'value' | 'document', text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: t('nuxtUiMongocamp.documentView.copied'), color: 'success' })
  }
  catch {
    toast.add({ title: t('nuxtUiMongocamp.documentView.copyFailed'), color: 'error' })
  }
  emit('copy', { kind, text })
}

// a leaf copies the value as written (a long as every digit, a date as its text); a container copies its JSON
function valueText(node: TreeNode): string {
  return node.children || node.type === 'array' || node.type === 'object' ? valueToJson(node.value, true) : nodeDisplay(node).text
}

const modeItems = computed(() => [
  { label: t('nuxtUiMongocamp.documentView.modeTree'), value: 'tree' as const, icon: 'i-lucide-list-tree' },
  { label: t('nuxtUiMongocamp.documentView.modeJson'), value: 'json' as const, icon: 'i-lucide-braces' },
])
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div
        class="inline-flex rounded-md border border-default p-0.5"
        role="group"
        :aria-label="t('nuxtUiMongocamp.documentView.modeLabel')"
      >
        <UButton
          v-for="item in modeItems"
          :key="item.value"
          :label="item.label"
          :icon="item.icon"
          size="xs"
          color="neutral"
          :variant="mode === item.value ? 'subtle' : 'ghost'"
          :aria-pressed="mode === item.value"
          @click="mode = item.value"
        />
      </div>
      <div class="flex items-center gap-1">
        <UButton
          v-if="mode === 'tree' && hasContainers"
          :label="allOpen ? t('nuxtUiMongocamp.documentView.collapseAll') : t('nuxtUiMongocamp.documentView.expandAll')"
          :icon="allOpen ? 'i-lucide-chevrons-down-up' : 'i-lucide-chevrons-up-down'"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="toggleAll"
        />
        <UButton
          :label="t('nuxtUiMongocamp.documentView.copyDocument')"
          icon="i-lucide-copy"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="!document"
          @click="copy('document', jsonText)"
        />
      </div>
    </div>

    <p
      v-if="!document"
      class="text-sm text-dimmed"
    >
      {{ t('nuxtUiMongocamp.documentView.empty') }}
    </p>

    <pre
      v-else-if="mode === 'json'"
      class="max-h-[70vh] overflow-auto rounded-md bg-elevated p-3 text-xs whitespace-pre-wrap break-all"
      data-test="document-json"
    >{{ jsonText }}</pre>

    <template v-else>
      <p
        v-if="isLarge"
        class="text-xs text-dimmed"
      >
        {{ t('nuxtUiMongocamp.documentView.collapsedNote') }}
      </p>
      <ul
        class="flex flex-col text-sm"
        role="tree"
        data-test="document-tree"
      >
        <li
          v-for="node in rows"
          :key="node.path"
          class="group flex items-start gap-1 rounded px-1 py-0.5 hover:bg-elevated"
          :style="{ paddingLeft: `${node.depth * 16 + 4}px` }"
          role="treeitem"
          :aria-expanded="node.children ? expanded.has(node.path) : undefined"
          :data-path="node.path"
        >
          <button
            v-if="node.children"
            type="button"
            class="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
            :aria-label="expanded.has(node.path) ? t('nuxtUiMongocamp.documentView.collapse') : t('nuxtUiMongocamp.documentView.expand')"
            @click="toggle(node)"
          >
            <UIcon
              :name="expanded.has(node.path) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-4"
            />
          </button>
          <span
            v-else
            class="inline-block size-6 shrink-0"
          />
          <span class="shrink-0 font-medium">{{ node.key }}</span>
          <UBadge
            :label="node.type"
            :color="BADGE_COLORS[node.type]"
            variant="subtle"
            size="sm"
            class="shrink-0"
            :title="t('nuxtUiMongocamp.documentView.typeLabel', { type: node.type })"
          />
          <span
            class="min-w-0 break-all text-dimmed"
            :title="nodeDisplay(node).title"
          >{{ nodeDisplay(node).text }}</span>
          <span class="ml-auto flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              class="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
              :aria-label="t('nuxtUiMongocamp.documentView.copyPath')"
              :title="t('nuxtUiMongocamp.documentView.copyPath')"
              @click="copy('path', node.path)"
            >
              <UIcon
                name="i-lucide-route"
                class="size-4"
              />
            </button>
            <button
              type="button"
              class="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
              :aria-label="t('nuxtUiMongocamp.documentView.copyValue')"
              :title="t('nuxtUiMongocamp.documentView.copyValue')"
              @click="copy('value', valueText(node))"
            >
              <UIcon
                name="i-lucide-copy"
                class="size-4"
              />
            </button>
          </span>
        </li>
      </ul>
      <p
        v-if="tree.truncated"
        class="text-xs text-warning"
      >
        {{ t('nuxtUiMongocamp.documentView.truncated', { count: tree.total }) }}
      </p>
    </template>
  </div>
</template>
