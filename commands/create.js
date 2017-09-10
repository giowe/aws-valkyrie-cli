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
      .then(({ id: restApiId }) => {
        g.restApiId = restApiId;
        l.success(`${g.name} API (id: ${g.restApiId}) created in ${g.region};`);
        return g.apigateway.getResources({ restApiId }).promise();
      })
      .then(({ items: [{ id: parentId }] }) => {
        return g.apigateway.createResource({
          restApiId: g.restApiId,
          parentId, pathPart: '{proxy+}'
        }).promise();
      })
      .then(({ id: resourceId }) => {
        g.resourceId = resourceId;
        return g.apigateway.putMethod({
          authorizationType: 'NONE',
          httpMethod: 'ANY',
          resourceId,
          restApiId: g.restApiId,
          apiKeyRequired: false,
          operationName: 'Valkyrie proxy'
        }).promise();
      })
      .then(() => {
        return g.apigateway.putIntegration({
          httpMethod: 'get',
          resourceId: g.resourceId,
          restApiId: g.restApiId,
          type: 'AWS',
          uri: 'arn:aws:lambda:eu-west-1:477398036046:function:aws-valkyrie-dev-lambda'
        }).promise();
      })
      .then(l.success)
      .catch(err => {
        l.fail('Creation process failed;');
        l.error(err);
        if (g.restApiId) {
          l.log('Reverting modifications...');
          g.apigateway.deleteRestApi({ restApiId: g.restApiId }).promise()
            .then(l.success(`${g.name} API (id: ${g.restApiId}) deleted;`))
            .catch(l.error);
        }
      })
      .then(l.succeed);
  }
};
