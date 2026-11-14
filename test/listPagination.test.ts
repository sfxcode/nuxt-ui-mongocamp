import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { LIST_PAGE_SIZE, createListPagination } from '../src/runtime/utils/listPagination'

describe('createListPagination', () => {
  it('starts on page 1 and only asks for a pager when there is more than one page', () => {
    const total = ref(LIST_PAGE_SIZE)
    const list = createListPagination(() => total.value)
    expect(list.page.value).toBe(1)
    expect(list.paged.value).toBe(false)
    total.value = LIST_PAGE_SIZE + 1
    expect(list.paged.value).toBe(true)
  })

  it('maps the 1-based pager page onto the table page index and keeps it inside the list', () => {
    const list = createListPagination(() => 60, 25)
    list.page.value = 3
    expect(list.pagination.value.pageIndex).toBe(2)
    list.page.value = 9
    expect(list.page.value).toBe(3)
    list.page.value = 0
    expect(list.page.value).toBe(1)
  })

  it('moves back to the last page when the list shrinks below the page on screen', async () => {
    const total = ref(60)
    const list = createListPagination(() => total.value, 25)
    list.page.value = 3
    total.value = 40
    await nextTick()
    expect(list.page.value).toBe(2)
    total.value = 0
    await nextTick()
    expect(list.page.value).toBe(1)
  })

  it('reset() goes back to the first page, as a new search does', () => {
    const list = createListPagination(() => 60, 25)
    list.page.value = 2
    list.reset()
    expect(list.page.value).toBe(1)
  })

  it('hands the table a pagination row model', () => {
    expect(typeof createListPagination(() => 0).options.getPaginationRowModel).toBe('function')
  })
})
