'use strict';
const inquirer = require('inquirer');
const AWS = require('aws-sdk');

module.exports = {
  description: 'Create a new Valkyrie application',
  fn: ({ l, commands, args }) => new Promise((resolve, reject) => {
    const g = {};
    const notNullValidator = (val) => val !== '';
    inquirer.prompt([
      { type: 'input', name: 'projectName', message: 'Project name:', validate: notNullValidator, default: 'test' },
      { type: 'input', name: 'region', message: 'Region name:', validate: notNullValidator, default: 'eu-west-1' },
    ])
      .then(answers => Object.assign(g, answers))

      //POLICY CREATION
      .then(() => {
        g.iam = new AWS.IAM();
        return g.iam.createPolicy({
          PolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'logs:CreateLogGroup',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents'
                ],
                Resource: 'arn:aws:logs:*:*:*'
              }
            ]
          }),
          PolicyName: `valkyrie-${g.projectName}-lambda-policy`,
          Description: `Valkyrie "${g.projectName}" project policy attached to "valkyrie-${g.projectName}-lambda-role"`,
          Path: '/valkyrie/'
        }).promise();
      })
      .then(({ Policy: { PolicyName: policyName, Arn: policyArn } }) => {
        g.policyName = policyName;
        g.policyArn = policyArn;
        l.success(`${policyName} policy (arn: ${policyArn}) created;`);
      })

      //ROLE CREATION
      .then(() => {
        return g.iam.createRole({
          AssumeRolePolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Sid: '1',
                Effect: 'Allow',
                Principal: {
                  Service: 'lambda.amazonaws.com'
                },
                Action: 'sts:AssumeRole'
              }
            ]
          }),
          RoleName: `valkyrie-${g.projectName}-lambda-role`,
          Description: `Valkyrie "${g.projectName}" project role assumed by "valkyrie-${g.projectName}-lambda"`,
          Path: '/valkyrie/'
        }).promise();
      })
      .then(({ Role: { RoleName: roleName, Arn: roleArn } }) => {
        g.roleName = roleName;
        g.roleArn = roleArn;
        l.success(`${roleName} role (arn: ${roleArn}) created`);
      })

      //API CREATION
      .then(() => {
        g.apigateway = new AWS.APIGateway({ region: g.region });
        return g.apigateway.createRestApi({
          name: g.projectName,
          description: 'Valkyrie application'
        }).promise();
      })
      .then(({ id: restApiId }) => {
        g.restApiId = restApiId;
        l.success(`${g.projectName} API (id: ${g.restApiId}) created in ${g.region};`);
      })

      //RESOURCE CREATION
      .then(() => g.apigateway.getResources({ restApiId: g.restApiId }).promise())
      .then(({ items: [{ id: parentId }] }) => g.apigateway.createResource({
        restApiId: g.restApiId,
        parentId, pathPart: '{proxy+}'
      }).promise())
      .then(({ id: resourceId }) => {
        g.resourceId = resourceId;
        l.success(`{proxy+} resource (id: ${resourceId}) created`);
      })

      //METHOD CREATION
      .then(() => g.apigateway.putMethod({
        authorizationType: 'NONE',
        httpMethod: 'ANY',
        resourceId: g.resourceId,
        restApiId: g.restApiId,
        apiKeyRequired: false,
        operationName: 'Valkyrie proxy'
      }).promise())
      .then(() => l.success('ANY method created'))

      //ATTACHING LAMBDA
      .then(() => g.apigateway.putIntegration({
        httpMethod: 'POST',
        resourceId: g.resourceId,
        restApiId: g.restApiId,
        type: 'HTTP',
        uri: 'arn:aws:lambda:eu-west-1:477398036046:function:aws-valkyrie-dev-lambda'
      }).promise())
      .then(resolve)
      .catch(err => {
        l.fail('Creation process failed;');
        l.error(err);
        if (g.restApiId) {
          l.log('Reverting modifications...');
          commands.delete.fn({ l, commands, args }, g)
            .then(() => reject(err))
            .catch(reject);
        } else {
          reject(err);
        }
      });
  })
};
