const {logger: l} = require('aws-valkyrie-utils');
const proxyLocal = require('aws-apigateway-proxy-local');
const path = require('path');
const argv = require('simple-argv');
const {getProjectInfo} = require('../utils');

module.exports = {
  description: 'Runs locally your Valkyrie application;',
  flags: [
    {
      name: 'env',
      short: 'e',
      description: 'Set the environment;'
    },
    {
      name: 'port',
      short: 'p',
      description: 'Set the local port, default to 8000;'
    },
    {
      name: 'profile',
      description: 'Uses a specific profile instead of the default one;'
    }
  ],
  fn: () => new Promise(() => {
    const {root, valkconfig} = getProjectInfo();
    const [fileName, handler] = valkconfig.Environments.staging.Lambda.Handler.split('.');
    const lambdaFn = require(path.join(root, fileName));
    proxyLocal(argv.port || argv.p || 8000, lambdaFn, handler, {}, {log: l.log, error: l.error, success: l.success});
  })
};
