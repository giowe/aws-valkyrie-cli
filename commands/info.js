'use strict';

const { getProjectInfo, getAWSCredentials, getRequiredEnv, getEnvColor, getApiUrl } = require('../utils');
const AWS = require('aws-sdk');
const argv = require('simple-argv');
const CwLogs = require('aws-cwlogs');

module.exports = {
  description: 'Shows distributions urls;',
  /*flags: [{
    name: 'staging',
    short: 's',
    description: ''
  }],*/
  fn: ({ l }) => new Promise((resolve, reject) => {
    const { valkconfig } = getProjectInfo();
    const awsCredentials = { credentials: getAWSCredentials() };
    const envNames = Object.keys(valkconfig.Environments);
    const envValues = Object.values(valkconfig.Environments);
    const apigateway = new AWS.APIGateway(Object.assign({ region: valkconfig.Project.Region }, awsCredentials));
    envNames.forEach(env => l.log(`${env}:${l.colors[getEnvColor(env)]}`, getApiUrl(valkconfig, env)));
    /*Promise.resolve()
      .then(() => Promise.all(envNames.map(env => apigateway.getDeployments({ restApiId: valkconfig.Environments[env].Api.Id }).promise())))
      .then(results => results.forEach(l.log))
      .then(resolve)
      .catch(reject);*/
  })
};
