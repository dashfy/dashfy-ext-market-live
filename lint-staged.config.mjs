/**
 * Lint-staged configuration for @getdashfy/ext-market-live
 * Runs linters and formatters on staged files before commit
 * @see https://github.com/lint-staged/lint-staged
 */
const lintStagedConfig = {
  '*.{ts,tsx}': (filenames) => {
    const filesString = filenames.join(' ')

    return [
      `prettier --write ${filesString}`,
      `eslint --fix --max-warnings=0 ${filesString}`,
      'pnpm typecheck',
    ]
  },

  '*.{js,mjs}': (filenames) => {
    const filesString = filenames.join(' ')

    return [`prettier --write ${filesString}`, `eslint --fix --max-warnings=0 ${filesString}`]
  },

  '*.{json,css,md}': (filenames) => {
    const filesString = filenames.join(' ')

    return [`prettier --write ${filesString}`]
  },

  '*.{yml,yaml}': (filenames) => {
    const filesString = filenames.join(' ')

    return [`prettier --write ${filesString}`]
  },
}

export default lintStagedConfig
