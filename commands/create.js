'use strict';
const inquirer = require('inquirer');
const AWS = require('aws-sdk');
module.exports = {
  description: 'Create a new Valkyrie application',
  fn: ({ l, commands, args }) => {
    const notNullValidator = (val) => val !== '';
    inquirer.prompt([
      { type: 'input', name: 'name', message: 'Project name:', validate: notNullValidator },
      { type: 'input', name: 'region', message: 'Region name:', validate: notNullValidator }
    ])
      .then(({ name, region }) => {
        const apigateway = new AWS.APIGateway({ region });
        apigateway.createRestApi({
          name,
          description: 'Valkyrie application'
        }, (err, { id: restApiId }) => {
          if (err) return l.error(err);
          l.success(`${name} API (id: ${restApiId}) created in ${region};`);

          apigateway.getResources({ restApiId }, (err, { items: [{ id: parentId }] }) => {
            if (err) return l.error(err);
            apigateway.createResource({
              restApiId,
              parentId,
              pathPart: '{proxy+}'
            }, (err, { id: resourceId }) => {
              if (err) return l.error(err);
              apigateway.putMethod({
                authorizationType: 'NONE',
                httpMethod: 'ANY',
                resourceId,
                restApiId,
                apiKeyRequired: false,
                operationName: 'Valkyrie proxy'
              }, (err, data) => {
                if (err) return l.error(err);
                l.success(data);
              });
            });
          });
        });
      })
      .catch(l.error);
  }
};
