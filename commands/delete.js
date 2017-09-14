'use strict';

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

module.exports = {
  description: 'Delete an existing Valkyrie application',
  fn: ({ l, commands, args }, valkconfig) => new Promise((resolve, reject) => {
    if (!valkconfig) {
      try {
        valkconfig = fs.readFileSync(path.join(process.cwd(), '.valkconfig'));
      } catch(err) {
        l.error('can\'t find .valkconfg in current working directory'); //todo use liftoff to get this file, maybe i need this from main fn arg
      }
      valkconfig = JSON.parse(valkconfig);
    }
    const g = {
      iam: new AWS.IAM()
    };
    const region = valkconfig.Project.Region;
    const PolicyArn = valkconfig.Iam.PolicyArn;
    const RoleName = valkconfig.Iam.RoleName;
    const restApiId = valkconfig.Api.Id;

    g.iam.detachRolePolicy({ PolicyArn, RoleName }).promise()
      .then(() => l.success(`${PolicyArn} detached from ${RoleName};`))
      .then(() => g.iam.deletePolicy({ PolicyArn }).promise())
      .then(() => l.success(`${PolicyArn} policy deleted;`))
      .then(() => g.iam.deleteRole({ RoleName }).promise())
      .then(() => l.success(`${RoleName} role deleted;`))
      .then(() => new AWS.APIGateway({ region }).deleteRestApi({ restApiId }).promise())
      .then(() => l.success(`${restApiId} API deleted;`))
      //todo do I want to delete folder too?
      .then(resolve)
      .catch((err) => {
        l.error(err);
        reject(err);
      });
  })
};
