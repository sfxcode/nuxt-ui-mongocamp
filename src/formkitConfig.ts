// Which FormKit config file `@formkit/nuxt` should load. Kept out of `module.ts` (which needs a Nuxt
// context) so the rule can be unit-tested.

const EXTENSIONS = ['ts', 'mjs', 'js']

/**
 * The module's own default config is used only when the app brings none: no `formkit.configFile`
 * option and no `formkit.config.{ts,mjs,js}` in its root directory. Returns the path to hand to
 * `@formkit/nuxt`, or `undefined` to leave its options alone.
 */
export function defaultFormkitConfigFile(
  rootDir: string,
  configuredFile: string | undefined,
  defaultFile: string,
  exists: (path: string) => boolean,
): string | undefined {
  if (configuredFile) return undefined
  const base = `${rootDir.replace(/[\\/]+$/, '')}/formkit.config`
  if (EXTENSIONS.some(extension => exists(`${base}.${extension}`))) return undefined
  return defaultFile
}
