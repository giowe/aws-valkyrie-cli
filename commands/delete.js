'use strict';

const AWS = require('aws-sdk');

module.exports = {
  description: 'Delete an existing Valkyrie application',
  fn: ({ l, commands, args }, data) => new Promise((resolve, reject) => {
    const g = {
      iam: new AWS.IAM()
    };
    const { template: { region, projectName }, restApiId, policyName, policyArn, roleName } = data;
    g.iam.detachRolePolicy({ PolicyArn: policyArn, RoleName: roleName }).promise()
      .then(() => l.success(`${policyName} detached from ${roleName};`))
      .then(() => g.iam.deletePolicy({ PolicyArn: policyArn }).promise())
      .then(() => l.success(`${policyName} policy deleted;`))
      .then(() => g.iam.deleteRole({ RoleName: roleName }).promise())
      .then(() => l.success(`${roleName} role deleted;`))
      .then(() => new AWS.APIGateway({ region }).deleteRestApi({ restApiId }).promise())
      .then(() => l.success(`${projectName} API deleted;`))
      //todo do I want to delete folder too?
      .then(resolve)
      .catch((err) => {
        l.error(err);
        reject(err);
      });
  })
};
