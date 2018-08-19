const { logger: l } = require("aws-valkyrie-utils")
const { colors } = l
const path = require("path")
const fs = require("fs")
const argv = require("simple-argv")
const inquirer = require("inquirer")
const urlJoin = require("url-join")
const cwd = process.cwd()
const { getProjectInfo, getDefaultProfile, getEnvColor, getApiUrl } = require("../utils")
const { create: createEnv } = require("../lib/environment.js")
const { lambdaTemplateQuestions } = require("../lib/const.js")

const notNullValidator = (val) => val === "" ? "required field;" : true

module.exports = {
  description: "Add a new environment to your Valkyrie application;",
  flags: [
    {
      name: "profile",
      description: "Uses a specific profile instead of the default one;"
    }
  ],
  fn: () => new Promise((resolve, reject) => {
    const { valkconfig, pkg } = getProjectInfo()
    const vars = {
      projectFolder: cwd
    }
    inquirer.prompt([
      { type: "input", name: "name", message: "name:" },
      ...lambdaTemplateQuestions,
      { type: "input", name: "handler", message: "Lambda handler:", validate: notNullValidator, default: "index.handler" },
      { type: "list", name: "envColor", message: "color:", choices: Object.keys(colors).filter(color => color !== "bg" && color !== "reset").map(color => ({ name: `${colors[color]}${color}${colors.reset}`, value: color })) },
      { type: "confirm", name: "requiredConfirm", message: "require confirmation on update:" }
    ])
      .then(answers => {
        const { name: envName, envColor, requiredConfirm } = answers
        if (valkconfig.Environments[envName]) {
          throw new Error(`${envName} environment already exists`)
        }
        vars.envName = envName
        valkconfig.Environments[envName] = { Iam: {}, Lambda: {}, Api: {}, EnvColor: envColor, Confirm: requiredConfirm }
        vars[vars.envName] = {}
        const lambdaTemplate = lambdaTemplateQuestions.reduce((acc, { name: field }) => Object.assign(acc, { [field]: answers[field] }), {
          handler: answers.handler,
          region: valkconfig.Project.Region
        })
        return createEnv(pkg.name, vars.projectFolder, lambdaTemplate, envName, argv.profile || getDefaultProfile())
      })
      .then(config => {
        Object.assign(valkconfig.Environments[vars.envName], config)
        l.success(`valkconfig.json:\n${JSON.stringify(valkconfig, null, 2)}`)
        fs.writeFileSync(path.join(cwd, "valkconfig.json"), JSON.stringify(valkconfig, null, 2))
        l.success(`Valkyrie ${vars.envName} successfully created;`)
        l.log(`- ${vars.envName.toLowerCase()}: ${l.colors[getEnvColor(valkconfig, vars.envName)]}${urlJoin(getApiUrl(valkconfig, vars.envName), vars.root)}${l.colors.reset}`, { prefix: false })
        return resolve()
      })
      .catch(err => {
        l.fail("creation process failed;")
        l.error(err)
      })
      .then(resolve)
      .catch(reject)
  })
}
