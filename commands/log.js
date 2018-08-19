const { logger: l } = require("aws-valkyrie-utils")
const { getProjectInfo, getAWSCredentials, getRequiredEnv, getEnvColor } = require("../utils")
const argv = require("simple-argv")
const CwLogs = require("aws-cwlogs")

module.exports = {
  description: "Streams real-time application logs from AWS CloudWatch Logs;",
  flags: [
    {
      name: "stream",
      short: "s",
      description: "AWS CloudWatch Logs stream, latest by default;"
    },
    {
      name: "profile",
      description: "Uses a specific profile instead of the default one;"
    }
  ],
  fn: () => new Promise((resolve, reject) => {
    const { valkconfig } = getProjectInfo()
    getRequiredEnv(valkconfig)
      .then(({ env }) => {
        const logGroupName = `/aws/lambda/${valkconfig.Environments[env].Lambda.FunctionName}`
        l.log(`streaming from ${l.colors[getEnvColor(valkconfig, env)]}${logGroupName}${l.colors.reset}:\n`)

        new CwLogs({
          region: valkconfig.Project.Region,
          logGroupName,
          streamname: argv.stream || argv.s,
          momentTimeFormat: "hh:mm:ss:SSS",
          logFormat: "lambda",
          credentials: getAWSCredentials(argv.profile)
        }).start()
      })
      .then(resolve)
      .catch(reject)
  })
}
