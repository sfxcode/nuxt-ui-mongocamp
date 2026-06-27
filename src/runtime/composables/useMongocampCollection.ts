import { ref } from 'vue'

export default () => {
  const filter = ref<string>()
  const sort = ref<string[] | undefined>()
  const projection = ref<string[] | undefined>()

  const pagination = ref({
    pageIndex: 1,
    pageSize: 20,
  })

  const total = ref(0)

  return { filter, sort, projection, pagination, total }
}
