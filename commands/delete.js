'use strict';

const AWS = require('aws-sdk');
const { getAWSCredentials, getProjectInfo, breakChain } = require('../utils');
const inquirer = require('inquirer');

module.exports = {
  description: 'Delete an existing Valkyrie application',
  fn: ({ l }, valkconfig = null) => new Promise((resolve, reject) => {
    const programmaticDeletion = valkconfig !== null;
    if (!valkconfig) valkconfig = getProjectInfo().valkconfig;

    const awsCredentials = getAWSCredentials();
    const { Region: region } = valkconfig.Project;
    const { PolicyArn, RoleName } = valkconfig.Iam;
    const { FunctionName } = valkconfig.Lambda;
    const { Id: restApiId } = valkconfig.Api;

    const iam = new AWS.IAM(awsCredentials);

    (() => {
      if (!programmaticDeletion) {
        return inquirer.prompt([{ type: 'confirm', name: 'confirm', message: 'All AWS infrastructure related to this project will be deleted and it will be impossible to restore it, including roles and policies. Continue?', default: false }]).then(({ confirm }) => {
          if (!confirm) {
            l.log('process aborted;');
            breakChain();
          }
        });
      }
      else return Promise.resolve();
    })()
      .then(() => { if (PolicyArn && RoleName) return iam.detachRolePolicy({ PolicyArn, RoleName }).promise(); })
      .then(data => { if (data) l.success(`${PolicyArn} detached from ${RoleName};`); })

      .then(() => { if (PolicyArn) return iam.deletePolicy({ PolicyArn }).promise(); })
      .then(data => { if (data) l.success(`${PolicyArn} policy deleted;`); })

      .then(() => { if (RoleName) return iam.deleteRole({ RoleName }).promise(); })
      .then(data => { if (data) l.success(`${RoleName} role deleted;`); })

      .then(() => { if (FunctionName) return new AWS.Lambda(Object.assign({ region }, awsCredentials)).deleteFunction({ FunctionName }).promise(); })
      .then(data => { if (data) l.success(`${FunctionName} lambda deleted;`); })

      .then(() => { if (restApiId) return new AWS.APIGateway(Object.assign({ region }, awsCredentials)).deleteRestApi({ restApiId }).promise(); })
      .then(data => { if (data) l.success(`${restApiId} API deleted`); })

      .then(() => l.success('deletion completed'))
      .then(resolve)
      .catch(err => {
        if (err.chainBraker) resolve();
        else reject(err);
      });
  })
};
