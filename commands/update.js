'use strict';
const { promisify } = require('util');
const zipdir = promisify(require('zip-dir'));
const { getProjectInfo, getAWSCredentials } = require('../utils');

const AWS = require('aws-sdk');

module.exports = {
  description: 'Updates ',
  flags: [
    {
      name: 'code',
      description: 'Updates just the AWS Lambda code part;'
    },
    {
      name: 'config',
      description: 'Updates just the AWS Lambda configuration part;'
    }
  ],
  fn: ({ l, argv }) => new Promise((resolve, reject) => {
    const { valkconfig, root } = getProjectInfo();
    const promises = [];
    const lambda = new AWS.Lambda(Object.assign({ region: valkconfig.Project.Region }, { credentials: getAWSCredentials() }));
    if ((!argv.code && !argv.config) || argv.code) promises.push(new Promise((resolve, reject) => {
      l.log('updating lambda code...');
      zipdir(root)
        .then(ZipFile => lambda.updateFunctionCode({ FunctionName: valkconfig.Lambda.FunctionName, ZipFile }).promise())
        .then(() => l.success('lambda code updated;'))
        .then(resolve)
        .catch(reject);
    }));

    if ((!argv.code && !argv.config) || argv.config) promises.push(new Promise((resolve, reject) => {
      l.log('updating lambda configuration...');
      lambda.updateFunctionConfiguration(valkconfig.Lambda).promise()
        .then(data => l.success(`lambda configuration updated:\n${JSON.stringify(data, null, 2)}`))
        .then(resolve)
        .catch(reject);
    }));

    Promise.all(promises)
      .then(resolve)
      .catch(reject);
  })
};
