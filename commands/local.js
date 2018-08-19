const { logger: l } = require("aws-valkyrie-utils")
const proxyLocal = require("aws-apigateway-proxy-local")
const path = require("path")
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
    {
      name: "env",
      short: "e",
      description: `Set the environment${valkconfig ? ` (default to ${valkconfig.LocalEnv})` : ""};`
    },
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
    const lambdaFn = require(path.join(root, fileName))
    proxyLocal(argv.port || argv.p || 8000, lambdaFn, handler, {}, { log: l.log, error: l.error, success: l.success })
  })
}
