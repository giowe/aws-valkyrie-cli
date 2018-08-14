const { logger: l } = require("aws-valkyrie-utils")
const { getProjectInfo, breakChain, getDefaultProfile, promiseWaterfall } = require("../utils")
const inquirer = require("inquirer")
const argv = require("simple-argv")
const { flags: { profile: profileFlag } } = require("../lib/const.js")
const { delete: deleteEnv } = require("../lib/environment.js")

module.exports = {
  description: "Deletes an existing Valkyrie application;",
  flags: [profileFlag],
  fn: ({ valkconfig = null }) => new Promise((resolve, reject) => {
    const programmaticDeletion = valkconfig !== null
    if (!valkconfig) valkconfig = getProjectInfo().valkconfig
    const envNames = Object.keys(valkconfig.Environments)
    return Promise.resolve()
      .then(() => {
        if (!programmaticDeletion) {
          return inquirer.prompt([{
            type: "confirm",
            name: "confirm",
            message: "All AWS infrastructure related to this project will be deleted and it will be impossible to restore it, including roles and policies. Continue?",
            default: false
          }]).then(({ confirm }) => {
            if (!confirm) {
              l.log("process aborted;")
              breakChain()
            }
          })
        } else {
          return Promise.resolve()
        }
      })
      .then(() => {
        return promiseWaterfall(envNames.map(env => {
          return () => deleteEnv(env, valkconfig, argv.profile || getDefaultProfile)
        }))
      })
      .then(() => l.success("deletion completed;"))
      .then(resolve)
      .catch(err => {
        if (err.chainBraker) resolve()
        else reject(err)
      })
  })
}
