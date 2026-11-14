import { computed, ref, watch } from 'vue'
import { getPaginationRowModel } from '@tanstack/vue-table'

/** Rows per page of the users, roles and jobs tables. */
export const LIST_PAGE_SIZE = 25

/**
 * Client-side paging for a `UTable` whose rows are all loaded (users, roles, jobs). The table pages its *sorted*
 * rows, so a header sort still orders the whole list; row selection is kept by row id across pages, and the
 * select-all box selects the page on screen. `total` is the row count after any search: a new search starts at the
 * first page, and a shorter list (after a delete) never leaves the page past the end.
 */
export function createListPagination(total: () => number, pageSize = LIST_PAGE_SIZE) {
  const pagination = ref({ pageIndex: 0, pageSize })
  const pageCount = computed(() => Math.max(1, Math.ceil(total() / pageSize)))
  // A new object each time: the table reads its pagination model as a whole, a changed field alone goes unnoticed
  const goTo = (pageIndex: number) => {
    pagination.value = { pageIndex, pageSize }
  }

  watch(total, (count, before) => {
    if (count !== before && pagination.value.pageIndex >= pageCount.value) goTo(pageCount.value - 1)
  })

  return {
    pagination,
    options: { getPaginationRowModel: getPaginationRowModel() },
    /** 1-based, for `UPagination` */
    page: computed({
      get: () => pagination.value.pageIndex + 1,
      set: (value: number) => goTo(Math.min(Math.max(value, 1), pageCount.value) - 1),
    }),
    /** Whether a pager is worth showing */
    paged: computed(() => total() > pageSize),
    reset: () => goTo(0),
    pageSize,
  }
}
