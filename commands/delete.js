'use strict';

const AWS = require('aws-sdk');

module.exports = {
  description: 'Delete an existing Valkyrie application',
  fn: ({ l, commands, args }, data) => new Promise((resolve, reject) => {
    const g = {};
    const { region, projectName, restApiId, policyName, policyArn } = data;
    new AWS.IAM().deletePolicy({
      PolicyArn: policyArn
    }).promise()
      .then(() => {
        l.success(`${policyName} policy (arn: ${policyArn}) deleted;`);
        return new AWS.APIGateway({ region }).deleteRestApi({ restApiId }).promise();
      })
      .then(() => {
        l.success(`${projectName} API (id: ${restApiId}) deleted;`);
        resolve();
      })
      .catch((err) => {
        l.error(err);
        reject(err);
      });
  })
};
