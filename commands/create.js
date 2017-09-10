'use strict';
const inquirer = require('inquirer');
const AWS = require('aws-sdk');

const g = {};
module.exports = {
  description: 'Create a new Valkyrie application',
  fn: ({ l, commands, args }) => {
    const notNullValidator = (val) => val !== '';
    inquirer.prompt([
      { type: 'input', name: 'name', message: 'Project name:', validate: notNullValidator },
      { type: 'input', name: 'region', message: 'Region name:', validate: notNullValidator }
    ])
      .then(answers => {
        Object.assign(g, answers);
        g.apigateway = new AWS.APIGateway({ region: g.region });
        return g.apigateway.createRestApi({
          name: g.name,
          description: 'Valkyrie application'
        }).promise();
      })
      .then(data => {
        g.restApiId = data.id;
        l.success(`${g.name} API (id: ${g.restApiId}) created in ${g.region};`);
        return g.apigateway.getResources({
          restApiId: g.restApiId
        }).promise();
      })
      .then(({ items: [{ id: parentId }] }) => {
        return g.apigateway.createResource({
          restApiId: g.restApiId,
          parentId, pathPart: '{proxy+}'
        }).promise();
      })
      .then(({ id: resourceId }) => {
        return g.apigateway.putMethod({
          authorizationType: 'NONE',
          httpMethod: 'ANY',
          resourceId,
          restApiId: g.restApiId,
          apiKeyRequired: false,
          operationName: 'Valkyrie proxy'
        }).promise();
      })
      .then(l.success)
      .catch(l.error);
  }
};
