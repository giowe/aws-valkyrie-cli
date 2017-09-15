'use strict';

const AWS = require('aws-sdk');
const { getProjectInfo, breakChain } = require('../utils');
const inquirer = require('inquirer');

module.exports = {
  description: 'Delete an existing Valkyrie application',
  fn: ({ l, commands, args }, valkconfig = null) => new Promise((resolve, reject) => {
    const programmaticDeletion = valkconfig !== null;
    if (!valkconfig) valkconfig = getProjectInfo().valkconfig;
    const vars = { iam: new AWS.IAM() };
    const region = valkconfig.Project.Region;
    const PolicyArn = valkconfig.Iam.PolicyArn;
    const RoleName = valkconfig.Iam.RoleName;
    const restApiId = valkconfig.Api.Id;

    (() => {
      if (!programmaticDeletion) {
        return inquirer.prompt([{ type: 'confirm', name: 'confirm', message: 'All aws infrastructure related to this project will be deleted and it will be impossible to restore it, including roles and policies. Continue?', default: false}]).then(({confirm}) => {
          if (!confirm) {
            l.log('process aborted;');
            breakChain();
          }
        });
      }
      else return Promise.resolve();
    })()
      .then(() => vars.iam.detachRolePolicy({ PolicyArn, RoleName }).promise())
      .then(() => l.success(`${PolicyArn} detached from ${RoleName};`))
      .then(() => vars.iam.deletePolicy({ PolicyArn }).promise())
      .then(() => l.success(`${PolicyArn} policy deleted;`))
      .then(() => vars.iam.deleteRole({ RoleName }).promise())
      .then(() => l.success(`${RoleName} role deleted;`))
      .then(() => new AWS.APIGateway({ region }).deleteRestApi({ restApiId }).promise())
      .then(() => l.success(`${restApiId} API deleted;`))
      .then(resolve)
      .catch(err => {
        if (err.chainBraker) resolve();
        else reject(err);
      });
  })
};
