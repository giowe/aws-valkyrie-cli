'use strict';
const inquirer = require('inquirer');
const AWS = require('aws-sdk');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const path = require('path');

/*exec('npm root -g')
  .then(({ stdout }) => {

  });
*/


module.exports = {
  description: 'Create a new Valkyrie application',
  fn: ({ l, commands, args }) => new Promise((resolve, reject) => {
    const g = {};
    const notNullValidator = (val) => val !== '';
    inquirer.prompt([
      { type: 'input', name: 'projectName', message: 'Project name:', validate: notNullValidator, default: 'test' },
      { type: 'input', name: 'region', message: 'Region name:', validate: notNullValidator, default: 'eu-west-1' },
      ...require('valkyrie-scaffolder-default').inputs
    ])
      .then(answers => Object.assign(g, answers))

      .then(() => {

        const scaffoldPath = require.resolve('valkyrie-scaffolder-default');
        throw new Error('ciao');
      })

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
        l.success(`${roleName} role (arn: ${roleArn}) created;`);
      })

      //ATTACHING POLICY
      .then(() => {
        g.iam.attachRolePolicy({
          PolicyArn: g.policyArn,
          RoleName: g.roleName
        }).promise();
      })
      .then(() => l.success(`${g.policyName} attached to ${g.roleName};`))

      //LAMBDA CREATION
      /*.then(() => {
        new AWS.Lambda({ region: g.region }).createFunction({
          Code: {},
          Description: "",
          FunctionName: "MyFunction",
          Handler: "souce_file.handler_name", // is of the form of the name of your source file and then name of your function handler
          MemorySize: 128,
          Publish: true,
          Role: "arn:aws:iam::123456789012:role/service-role/role-name", // replace with the actual arn of the execution role you created
          Runtime: "nodejs4.3",
          Timeout: 15,
          VpcConfig: {
          }
        }).promise();
      })
      .then((data) => l.success(data))
      */

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
        l.success(`{proxy+} resource (id: ${resourceId}) created;`);
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
      .then(() => l.success('ANY method created;'))

      //ATTACHING LAMBDA
      .then(() => g.apigateway.putIntegration({
        httpMethod: 'ANY',
        integrationHttpMethod: 'POST',
        resourceId: g.resourceId,
        restApiId: g.restApiId,
        type: 'AWS',
        uri: `arn:aws:apigateway:${g.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:477398036046:function:aws-valkyrie-dev-lambda`
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
