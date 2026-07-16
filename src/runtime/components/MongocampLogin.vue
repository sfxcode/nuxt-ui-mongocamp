<script setup lang='ts'>
import { consola } from 'consola'
import { ref, reactive } from 'vue'
import { useMongocampAuth } from '#imports'
import { navigateTo, useCookie } from '#app'

const { login } = useMongocampAuth()
const errorMessage = ref('')

const loginMail = useCookie('mongocamp_login', { maxAge: 30 * 24 * 60 * 60 })

const data = ref({ userId: loginMail.value, password: '' })
const schema = reactive(
  [
    {
      $el: 'h3',
      children: 'Mongocamp Login',
    },
    {
      $formkit: 'nuxtUIInput',
      name: 'userId',
      label: 'Email',
      validation: 'required|email',
    },
    {
      $formkit: 'nuxtUIInput',
      name: 'password',
      label: 'Password',
      inputType: 'password',
      validation: 'required|length:3',
    },
  ],
)

async function actionLogin() {
  errorMessage.value = ''
  const loginId = data.value?.userId || ''
  try {
    await login(loginId, data.value?.password)
    loginMail.value = loginId
    navigateTo('/secured')
  }
  catch (e) {
    consola.log(e)
    errorMessage.value = 'Wrong Login or Password !'
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 p-4 w-1/2">
    <UPageCard class="w-full max-w-md">
      <FUDataEdit
        :data="data"
        :schema="schema"
        submit-label="Login"
        @data-saved="actionLogin"
      />
      <div
        v-if="errorMessage.length > 0"
        class="m-4 mt-2 text-2xl text-red-700 font-medium"
      >
        {{ errorMessage }}
      </div>
    </UPageCard>
  </div>
</template>
