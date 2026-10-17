import { h } from 'vue'
import type { Component } from 'vue'
import type { TableColumn } from '@nuxt/ui'

// Checkbox column for UTable's `v-model:row-selection`. Takes the resolved UCheckbox (callers
// resolve it once in setup, like UButton/UBadge) and already-translated labels, so this stays a
// plain function that works from inside a `computed` column list. Which rows may be selected at all
// is decided by the table's `enableRowSelection` (UTable `row-selection-options`), so select-all
// skips them too — a per-checkbox `disabled` alone would not stop select-all.
export function createSelectColumn<T>(
  checkbox: Component | string,
  labels: { selectAll: string, selectRow: string },
): TableColumn<T> {
  return {
    id: 'select',
    header: ({ table }) => h(checkbox, {
      'modelValue': table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(!!value),
      'aria-label': labels.selectAll,
    }),
    cell: ({ row }) => h(checkbox, {
      'modelValue': row.getIsSelected(),
      'disabled': !row.getCanSelect(),
      'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
      'aria-label': labels.selectRow,
    }),
  }
}
