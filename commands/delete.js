'use strict';

const AWS = require('aws-sdk');
const { getProjectInfo, breakChain } = require('../utils');
const inquirer = require('inquirer');

module.exports = {
  description: 'Delete an existing Valkyrie application',
  fn: ({ l }, valkconfig = null) => new Promise((resolve, reject) => {
    const programmaticDeletion = valkconfig !== null;
    if (!valkconfig) valkconfig = getProjectInfo().valkconfig;
    const vars = { iam: new AWS.IAM() };
    const region = valkconfig.Project.Region;
    const PolicyArn = valkconfig.Iam.PolicyArn;
    const RoleName = valkconfig.Iam.RoleName;
    const restApiId = valkconfig.Api.Id;

    (() => {
      if (!programmaticDeletion) {
        return inquirer.prompt([{ type: 'confirm', name: 'confirm', message: 'All aws infrastructure related to this project will be deleted and it will be impossible to restore it, including roles and policies. Continue?', default: false }]).then(({ confirm }) => {
          if (!confirm) {
            l.log('process aborted;');
            breakChain();
          }
        });
      }
      else return Promise.resolve();
    })()
      .then(() => {
        if (PolicyArn && RoleName) return vars.iam.detachRolePolicy({ PolicyArn, RoleName }).promise();
      })
      .then(() => {
        if (PolicyArn && RoleName) l.success(`${PolicyArn} detached from ${RoleName};`);
      })
      .then(() => {
        if (PolicyArn) return vars.iam.deletePolicy({ PolicyArn }).promise();
      })
      .then(() => {
        if (PolicyArn) l.success(`${PolicyArn} policy deleted;`);
      })
      .then(() => {
        if (RoleName) return vars.iam.deleteRole({ RoleName }).promise();
      })
      .then(() => {
        if (RoleName) l.success(`${RoleName} role deleted;`);
      })
      .then(() => {
        if (restApiId) return new AWS.APIGateway({ region }).deleteRestApi({ restApiId }).promise();
      })
      .then(() => {
        if (restApiId) l.success(`${restApiId} API deleted;`);
      })
      .then(() => l.success('deletion completed'))
      .then(resolve)
      .catch(err => {
        if (err.chainBraker) resolve();
        else reject(err);
      });
  })
};
