'use strict';

const AWS = require('aws-sdk');
const { getProjectInfo, breakChain } = require('../utils');
const inquirer = require('inquirer');

module.exports = {
  description: 'Delete an existing Valkyrie application',
  fn: ({ l }, valkconfig = null) => new Promise((resolve, reject) => {
    const programmaticDeletion = valkconfig !== null;
    if (!valkconfig) valkconfig = getProjectInfo().valkconfig;
    const vars = {};

    const { Region: region } = valkconfig.Project;
    const { PolicyArn, RoleName } = valkconfig.Iam;
    const { FunctionName } = valkconfig.Lambda;
    const { Id: restApiId } = valkconfig.Api;

    const iam = new AWS.IAM();

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
      .then(() => { if (PolicyArn && RoleName) return iam.detachRolePolicy({ PolicyArn, RoleName }).promise(); })
      .then(({ ResponseMetadata }) => { if (ResponseMetadata) l.success(`${PolicyArn} detached from ${RoleName};`); })
      //.then(() => { if (PolicyArn && RoleName) l.success(`${PolicyArn} detached from ${RoleName};`); })

      .then(() => { if (PolicyArn) return iam.deletePolicy({ PolicyArn }).promise(); })
      .then(({ ResponseMetadata }) => { if (ResponseMetadata) l.success(`${PolicyArn} policy deleted;`); })
      //.then(() => { if (PolicyArn) l.success(`${PolicyArn} policy deleted;`); })

      .then(() => { if (RoleName) return iam.deleteRole({ RoleName }).promise(); })
      .then(({ ResponseMetadata }) => { if (ResponseMetadata) l.success(`${RoleName} role deleted;`); })
      //.then(() => { if (RoleName) l.success(`${RoleName} role deleted;`); })

      .then(() => { if (FunctionName) return new AWS.Lambda({ region }).deleteFunction({ FunctionName }).promise(); })
      .then(console.log) //todo capire la response
      //.then(() => { if (FunctionName) l.success(`${FunctionName} lambda deleted;`); })

      .then(() => { if (restApiId) return new AWS.APIGateway({ region }).deleteRestApi({ restApiId }).promise(); })
      .then(console.log) //todo capire la response
      //.then(() => { if (restApiId) l.success(`${restApiId} API deleted;`); })

      .then(() => l.success('deletion completed'))
      .then(resolve)
      .catch(err => {
        if (err.chainBraker) resolve();
        else reject(err);
      });
  })
};
