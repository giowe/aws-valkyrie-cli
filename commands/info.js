const l = require("../logger.js")
const { getProjectInfo, /*getAWSCredentials, getRequiredEnv,*/ getEnvColor, getApiUrl } = require("../utils")
//const AWS = require('aws-sdk');
//const argv = require('simple-argv');

module.exports = {
  description: "Shows distributions urls;",
  fn: () => new Promise((resolve, reject) => {
    const { valkconfig } = getProjectInfo()
    const envNames = Object.keys(valkconfig.Environments)
    envNames.forEach(env => l.log(`${env}:${l.colors[getEnvColor(valkconfig, env)]}`, getApiUrl(valkconfig, env)))
    resolve()
  })
}
