const l = require("../logger.js")
const proxyLocal = require("aws-apigateway-proxy-local")
const { join } = require("path")
const argv = require("simple-argv")
const { getProjectInfo } = require("../utils")

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
    if (!valkconfig.LocalEnv) {
      throw new Error("missing LocalEnv key in valkconfig.json")
    }
    const [fileName, handler] = valkconfig.Environments[valkconfig.LocalEnv].Lambda.Handler.split(".")

    // this enables lambda env variables during local execution
    Object.entries(valkconfig.Environments[valkconfig.LocalEnv].Lambda.Environment.Variables).forEach(([key, value]) => process.env[key] = value)

    const port = argv.port || argv.p || 8000
    proxyLocal(require(join(root, fileName))[handler], {
      port,
      logger: { log: l.log, error: l.error, success: l.success },
      listeningMessage: `Valkyrie local listening on port ${port}`
    })
  })
}
