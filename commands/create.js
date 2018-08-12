const inquirer = require("inquirer")
const { logger: l } = require("aws-valkyrie-utils")
const AWS = require("aws-sdk")
const del = require("del")
const { promisify } = require("util")
const validate = require("validate-npm-package-name")
const exec = promisify(require("child_process").exec)
const path = require("path")
const fs = require("fs")
const argv = require("simple-argv")
const urlJoin = require("url-join")
const {
  getAWSCredentials,
  listFiles,
  subPath,
  generateRetryFn,
  getEnvColor,
  getApiUrl,
  createDistZip,
  notNullValidator,
  saveLocalValkconfig,
  promiseWaterfall
} = require("../utils")
const { templateQuestions: lambdaTemplateQuestions } = require("../lib/lambda.js")
const cwd = process.cwd()
const { selectScaffolder } = require("../lib/scaffolder.js")
const { flags: { profile: profileFlag }} = require("../lib/const.js")
const { create: createEnv } = require("../lib/environment.js")

module.exports = {
  description: "Creates a new Valkyrie application;",
  flags: [
    profileFlag
  ],
  fn: ({ commands }) => new Promise((resolve, reject) => {
    const vars = {}
    const valkconfig = {
      Project: {},
      Environments: {},
      LocalEnv: ""
    }

    selectScaffolder()
      .then(({ scaffolder, scaffolderSourcePath, handler, root, scaffolderInputs }) => {
        valkconfig.Project.Scaffolder = scaffolder
        Object.assign(vars, { scaffolderSourcePath, handler, root })
        const defaultInputs = [
          { type: "input", name: "projectName", message: "project name:", default: argv._[1], validate: name => {
            const { validForNewPackages, warnings, errors } = validate(name)
            if (validForNewPackages) return true
            const out = []
            if (errors) out.push(...errors)
            if (warnings) out.push(...warnings)
            return `${out.join(", ")};`
          } },
          { type: "checkbox", name: "environments", message: "select which environment you want to generate:", choices: [{ name: "staging", checked: true }, { name: "production", checked: true }], validate: (choices) => choices.length ? true : "select at least one environment;" },
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
        Object.assign(vars, {
          projectFolder: path.join(cwd, answers.projectName),
          plural: answers.environments.length > 1,
          lambdaTemplate: lambdaTemplateQuestions.reduce((acc, {name: field}) => Object.assign(acc, { [field]: answers[field] }), { handler: vars.handler, region: answers.region })
        })
        valkconfig.Project.Region = answers.region
        vars.template = answers
        answers.environments.forEach(env => {
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
          vars[env] = {}
        })
        if (!valkconfig.LocalEnv) {
          valkconfig.LocalEnv = "production"
        }
        fs.mkdirSync(vars.projectFolder)
      })

      //TEMPLATING AND SCAFFOLDING APPLICATION
      .then(() => {
        return listFiles(vars.scaffolderSourcePath,
          (filePath, content) => {
            let fileName = filePath.replace(vars.scaffolderSourcePath, "")
            fileName = fileName.replace("npmignore", "gitignore")
            Object.entries(vars.template).forEach(([key, value]) => {
              const re = new RegExp(`{{${key}}}`, "g")
              content = content.replace(re, value)
            })
            fs.writeFileSync(path.join(vars.projectFolder, fileName), content)
          },
          dirPath => fs.mkdirSync(path.join(path.join(cwd, subPath(dirPath, vars.templateName))))
        )
      })
      .then(() => l.success(`project scaffolded in ${vars.projectFolder}`))

      //INSTALLING PACKAGES
      .then(() => {
        l.wait("installing npm packages")
        return exec(`npm install --prefix ${vars.projectFolder}`)
      })
      .then(() => {
        l.success("project packages installed;")
        return del(path.join(vars.projectFolder, "etc"), { force: true })
      })
      .then(() => {
        const promises = Object.keys(valkconfig.Environments).map(env => {
          return () => createEnv(vars.template.projectName, vars.projectFolder, vars.lambdaTemplate, env, argv.profile)
            .then(envConfig => Object.assign(valkconfig.Environments[env], envConfig))
        })
        return promiseWaterfall(promises)
      })

      .then(() => {
        saveLocalValkconfig(vars.projectFolder, valkconfig)
        l.success(`valkconfig.json:\n${JSON.stringify(valkconfig, null, 2)}`)
        l.success(`Valkyrie ${vars.template.projectName} project successfully created; the application is available at the following link${vars.template.environments.length > 1 ? "s" : ""}:`)
        Promise.all(vars.template.environments.map(env => l.log(`- ${env.toLowerCase()}: ${l.colors[getEnvColor(valkconfig, env)]}${urlJoin(getApiUrl(valkconfig, env), vars.root)}${l.colors.reset}`, { prefix: false })))
        resolve()
      })
      .catch(err => {
        l.fail("creation process failed;")
        l.error(err)
        if (!argv["no-revert"]) {
          l.log("reverting modifications...")
          return commands.delete.fn({ argv, commands }, valkconfig)
        }
      })
      .then(resolve)
      .catch(reject)
  })
}
