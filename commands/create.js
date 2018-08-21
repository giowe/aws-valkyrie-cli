const inquirer = require("inquirer")
const l = require("../logger.js")
const del = require("del")
const { promisify } = require("util")
const validate = require("validate-npm-package-name")
const exec = promisify(require("child_process").exec)
const path = require("path")
const fs = require("fs")
const argv = require("simple-argv")
const urlJoin = require("url-join")
const {
  listFiles,
  subPath,
  getEnvColor,
  getApiUrl,
  notNullValidator,
  saveLocalValkconfig,
  promiseWaterfall,
  getDefaultProfile
} = require("../utils")
const cwd = process.cwd()
const { selectScaffolder } = require("../lib/scaffolder.js")
const { flags: { profile: profileFlag }, lambdaTemplateQuestions } = require("../lib/const.js")
const { create: createEnv } = require("../lib/environment.js")

module.exports = {
  description: "Creates a new Valkyrie application;",
  flags: [
    profileFlag
  ],
  fn: ({ commands }) => {
    const state = {}
    const valkconfig = {
      Project: {},
      Environments: {},
      LocalEnv: ""
    }

    return selectScaffolder()
      .then(({ scaffolder, scaffolderSourcePath, handler, root, scaffolderInputs }) => {
        valkconfig.Project.Scaffolder = scaffolder
        Object.assign(state, { scaffolderSourcePath, handler, root })
        const defaultInputs = [
          {
            type: "input", name: "projectName", message: "project name:", default: argv._[1], validate: name => {
              const { validForNewPackages, warnings, errors } = validate(name)
              if (validForNewPackages) return true
              const out = []
              if (errors) out.push(...errors)
              if (warnings) out.push(...warnings)
              return `${out.join(", ")};`
            }
          },
          {
            type: "checkbox",
            name: "environments",
            message: "select which environment you want to generate:",
            choices: [{ name: "staging", checked: true }, { name: "production", checked: true }],
            validate: (choices) => choices.length ? true : "select at least one environment;"
          },
          { type: "input", name: "region", message: "region name:", validate: notNullValidator, default: "eu-west-1" },
          ...lambdaTemplateQuestions
        ]
        const l = defaultInputs.length
        return inquirer.prompt([
          ...defaultInputs,
          ...scaffolderInputs.filter(({ name }) => {
            for (let i = 0; i < l; i++) if (defaultInputs[i].name === name) return false
            return true
          })
        ])
      })
      .then(answers => {
        const { projectName, region, environments } = state.template = answers
        Object.assign(state, {
          projectFolder: path.join(cwd, projectName),
          lambdaTemplate: lambdaTemplateQuestions.reduce((acc, { name: field }) => Object.assign(acc, { [field]: answers[field] }), {
            handler: state.handler,
            region
          })
        })
        valkconfig.Project.Region = region
        environments.forEach(env => {
          if (env === "staging") {
            valkconfig.LocalEnv = "staging"
          }
          valkconfig.Environments[env] = {
            Iam: {},
            Api: {},
            Lambda: {},
            EnvColor: env === "production" ? "magenta" : "cyan",
            Confirm: env === "production"
          }
          state[env] = {}
        })
        if (!valkconfig.LocalEnv) {
          valkconfig.LocalEnv = "production"
        }
        fs.mkdirSync(state.projectFolder)
      })
      //TEMPLATING AND SCAFFOLDING APPLICATION
      .then(() => {
        return listFiles(state.scaffolderSourcePath,
          (filePath, content) => {
            let fileName = filePath.replace(state.scaffolderSourcePath, "")
            fileName = fileName.replace("npmignore", "gitignore")
            Object.entries(state.template).forEach(([key, value]) => {
              const re = new RegExp(`{{${key}}}`, "g")
              content = content.replace(re, value)
            })
            fs.writeFileSync(path.join(state.projectFolder, fileName), content)
          },
          dirPath => fs.mkdirSync(path.join(path.join(cwd, subPath(dirPath, state.templateName))))
        )
      })
      .then(() => l.success(`project scaffolded in ${state.projectFolder}`))
      //INSTALLING PACKAGES
      .then(() => {
        l.wait("installing npm packages")
        return exec(`npm install --prefix ${state.projectFolder}`)
      })
      .then(() => {
        l.success("project packages installed;")
        return del(path.join(state.projectFolder, "etc"), { force: true })
      })
      .then(() => {
        const promises = Object.keys(valkconfig.Environments).map(env => {
          const { template: { projectName }, projectFolder, lambdaTemplate } = state
          return () => createEnv(projectName, projectFolder, lambdaTemplate, env, argv.profile || getDefaultProfile())
            .then(envConfig => Object.assign(valkconfig.Environments[env], envConfig))
        })
        return promiseWaterfall(promises)
      })

      .then(() => {
        const { projectFolder, template: { projectName, environments }, root } = state
        saveLocalValkconfig(projectFolder, valkconfig)
        l.success(`valkconfig.json:\n${JSON.stringify(valkconfig, null, 2)}`)
        l.success(`Valkyrie ${projectName} project successfully created; the application is available at the following link${environments.length > 1 ? "s" : ""}:`)
        return Promise.all(environments.map(env => l.log(`- ${env.toLowerCase()}: ${l.colors[getEnvColor(valkconfig, env)]}${urlJoin(getApiUrl(valkconfig, env), root)}${l.colors.reset}`, { prefix: false })))
      })
      .catch(err => {
        l.fail("creation process failed;")
        l.error(err)
        if (!argv["no-revert"]) {
          l.log("reverting modifications...")
          return commands.delete.fn({ argv, commands }, valkconfig)
        }
      })
  }
}
