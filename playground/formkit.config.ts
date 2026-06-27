// formkit.config.ts
import type { DefaultConfigOptions } from '@formkit/vue'
import { createAutoAnimatePlugin } from '@formkit/addons'
import { de, en } from '@formkit/i18n'
import { nuxtUIInputs, nuxtUIOutputs } from '@sfxcode/nuxt-ui-formkit/definitions'
import { addNuxtAsteriskPlugin } from '@sfxcode/nuxt-ui-formkit/plugins'

const config: DefaultConfigOptions = {
  locales: { en, de },
  // Define the active locale
  locale: 'en',
  inputs: { ...nuxtUIInputs, ...nuxtUIOutputs },
  // ignore FormKit iconLoader since we use our own icons and don't want to load the default ones
  iconLoader: (_) => {
    return undefined
  },
  plugins: [
    createAutoAnimatePlugin(
      {
        /* optional AutoAnimate config */
        // default:
        duration: 250,
        easing: 'ease-in-out',
      },
      {
        /* optional animation targets object */
        // default:
        global: ['outer', 'inner'],
        form: ['form'],
        nuxtUIRepeater: ['input'],
      },
    ),
    addNuxtAsteriskPlugin,
  ],
}

export default config
