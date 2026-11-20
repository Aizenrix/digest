import { ESLint } from 'eslint'

const args = process.argv.slice(2)
if (args.some(arg => arg !== '--deny-warnings')) throw new Error('Допустимый флаг: --deny-warnings')
const eslint = new ESLint()
const results = await eslint.lintFiles(['.'])
const output = await (await eslint.loadFormatter('stylish')).format(results)
if (output) console.log(output)
if (results.some(result => result.errorCount || (args.includes('--deny-warnings') && result.warningCount))) process.exitCode = 1
