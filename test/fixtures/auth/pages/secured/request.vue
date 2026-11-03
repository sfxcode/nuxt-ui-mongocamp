<template>
  <div>
    <h1>request page</h1>
    <button
      data-test="request"
      @click="run"
    >
      request
    </button>
    <p data-test="outcome">
      {{ outcome }}
    </p>
  </div>
</template>

<script setup>
// one real API call through the module's client (and the dependency's own middleware); the test stubs the answer
const outcome = ref('idle')
async function run() {
  try {
    await useMongocampClientApi().collectionApi.listCollections()
    outcome.value = 'ok'
  }
  catch (e) {
    outcome.value = `failed:${e?.response?.status ?? 'no-status'}`
  }
}
</script>
