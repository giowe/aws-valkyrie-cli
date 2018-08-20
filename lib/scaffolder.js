const inquirer = require("inquirer")
const fs = require("fs")
const path = require("path")
const { promisify } = require("util")
const l = require("../logger.js")
const exec = promisify(require("child_process").exec)
const { templatesPrefix } = require("./const.js")

const e = module.exports

/**
 * @param {Object} scaffolder
 * @param { string } scaffolder.name
 * @param { string } scaffolder.path
 * @type {function(*, *): {scaffolderInputs, scaffolderSourcePath: (*|string|*), handler, root, scaffolder: *}}
 */
const getScaffolderDetails = e.getScaffolderDetails = ({ path: scaffolderPath, name: scaffolder }) => {
  const { inputs: scaffolderInputs, source, handler, root } = require(scaffolderPath)
  return ({
    scaffolderInputs,
    scaffolderSourcePath: path.join(scaffolderPath, source),
    handler,
    root,
    scaffolder
  })
}

const getNpmGlobalPath = () => {
  return exec("npm root -g")
    .then(({ stdout }) => stdout.replace("\n", ""))
}

/**
 * Manage the selection and the retrieval of the scaffolder code and configs
 * @returns {PromiseLike<{scaffolder?: *} | never>} Promise object represents scaffolder details
 */
e.selectScaffolder = () => {
  const state = {
    scaffolders: {}
  }
  return getNpmGlobalPath()
    .then(npmGlobalPath => {
      const scaffoldersList = fs.readdirSync(npmGlobalPath).reduce((acc, module)=> {
        if (module.substr(0, templatesPrefix.length) === templatesPrefix) {
          const templatePath = path.join(npmGlobalPath, module)
          const templateListName = `${module.substr(templatesPrefix.length, module.length)} (${require(path.join(templatePath, "package.json")).version})`
          state.scaffolders[templateListName] = {
            name: module,
            path: templatePath
          }
          acc.push(templateListName)
        }
        return acc
      }, [])

      if (!scaffoldersList.length) throw new Error(`no Valkyrie scaffolders found! Install globally at least the default Valkyrie scaffolder running command: ${l.colors.cyan}npm i -g valkyrie-scaffolder-default${l.colors.reset}`)
      return inquirer.prompt({ type: "list", name: "scaffolder", message: "select a template to scaffold your project:", choices: scaffoldersList })
    })
    .then(({ scaffolder }) => getScaffolderDetails(state.scaffolders[scaffolder]))
}
