const l = require("../logger.js")
const proxyLocal = require("aws-apigateway-proxy-local")
const { join } = require("path")
const argv = require("simple-argv")
const { getProjectInfo, getRequiredEnv, getDefaultProfile, getAWSCredentials } = require("../utils")
const { role: { assumeRole } } = require("../lib/iam.js")

// TODO, to review
let valkconfig
try {
  valkconfig = getProjectInfo().valkconfig
} catch(e) {}

module.exports = {
  description: "Runs locally your Valkyrie application;",
  flags: [
    ...(valkconfig ? Object.keys(getProjectInfo().valkconfig.Environments).map(env => {
      return {
        name: env,
        description: `Test ${env} lambda locally;`
      }
    }) : []),
    {
      name: "port",
      short: "p",
      description: "Set the local port, default to 8000;"
    },
    {
      name: "profile",
      description: "Uses a specific profile instead of the default one;"
    }
  ],
  fn: () => new Promise(() => {
    const { root, valkconfig } = getProjectInfo()
    const state = {}
    return Promise.resolve()
      .then(() => {
        let selectedEnv
        if (Object.keys(valkconfig.Environments).some(env => {
          if (argv[env]) {
            selectedEnv = env
            return true
          } else {
            return false
          }
        })) {
          return selectedEnv
        } else {
          return getRequiredEnv(valkconfig).then(({ env }) => env)
        }
      })
      .then(env => {
        const { Lambda: { Role } } = valkconfig.Environments[env]
        state.env = env
        state.role = Role
        return assumeRole(Role, getAWSCredentials(argv.profile || getDefaultProfile()), valkconfig.Project.Region)
      })
      .then(() => {
        const { Lambda: { Environment: { Variables: envVariables }, Handler } } = valkconfig.Environments[state.env]

        const [fileName, handler] = Handler.split(".")

        // this enables lambda env variables during local execution
        Object.entries(envVariables).forEach(([key, value]) => process.env[key] = value)

        const port = argv.port || argv.p || 8000
        proxyLocal(require(join(root, fileName))[handler], {
          port,
          logger: { log: l.log, error: l.error, success: l.success },
          listeningMessage: `Valkyrie local listening on port ${port}`
        })
      })
      .catch(l.error)
  })
}
