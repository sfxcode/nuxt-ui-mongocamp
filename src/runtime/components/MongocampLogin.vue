<script setup lang='ts'>
import { consola } from 'consola'
import { ref, reactive } from 'vue'
import { useI18n, useMongocampAuth } from '#imports'
import { navigateTo, useCookie, useNuxtApp } from '#app'

const props = defineProps<{
  redirectPath?: string
  // hide the "Login" heading inside the card, e.g. when the page or the `header` slot already has one
  hideHeading?: boolean
}>()

const { t } = useI18n()
const { login } = useMongocampAuth()
const errorMessage = ref('')
const nuxtApp = useNuxtApp()

const loginMail = useCookie('mongocamp_login', { maxAge: 30 * 24 * 60 * 60 })

const data = ref({ userId: loginMail.value, password: '' })
// The inputs fill the card: FormKit's wrappers and the input itself would otherwise keep their intrinsic width
const fullWidth = { outerClass: 'w-full', innerClass: 'w-full', class: 'w-full' }

const schema = reactive(
  [
    ...(props.hideHeading
      ? []
      : [{
          $el: 'h3',
          children: t('nuxtUiMongocamp.login.heading'),
        }]),
    {
      $formkit: 'nuxtUIInput',
      name: 'userId',
      label: t('nuxtUiMongocamp.login.email'),
      validation: 'required|email',
      ...fullWidth,
    },
    {
      $formkit: 'nuxtUIInput',
      name: 'password',
      label: t('nuxtUiMongocamp.login.password'),
      inputType: 'password',
      validation: 'required|length:3',
      ...fullWidth,
    },
  ],
)

async function actionLogin() {
  errorMessage.value = ''
  const loginId = data.value?.userId || ''
  try {
    await login(loginId, data.value?.password)
    loginMail.value = loginId
    // `login` is a plain function reference (not a statically-recognized composable call), so
    // Nuxt's unctx build transform doesn't wrap this await — the Nuxt app context is lost by
    // the time it resolves, and a bare navigateTo() here silently no-ops. runWithContext
    // restores it explicitly around the composable call that actually needs it.
    await nuxtApp.runWithContext(() => navigateTo(props.redirectPath ?? '/'))
  }
  catch (e) {
    consola.log(e)
    errorMessage.value = t('nuxtUiMongocamp.login.error')
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 p-4 w-full">
    <UPageCard class="w-full max-w-md">
      <!-- above the form: a logo, a title, a hint -->
      <slot name="header" />
      <FUDataEdit
        :data="data"
        :schema="schema"
        :submit-label="t('nuxtUiMongocamp.login.submit')"
        @data-saved="actionLogin"
      />
      <div
        v-if="errorMessage.length > 0"
        role="alert"
        class="mt-2 text-sm text-error font-medium"
      >
        {{ errorMessage }}
      </div>
      <!-- below the form and its error: links, legal text -->
      <slot name="footer" />
    </UPageCard>
  </div>
</template>
