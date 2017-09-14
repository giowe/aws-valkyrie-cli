'use strict';
const inquirer = require('inquirer');
const AWS = require('aws-sdk');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const path = require('path');
const fs = require('fs');
const { listFiles, subPath } = require('../utils');
const cwd = process.cwd();

module.exports = {
  description: 'Create a new Valkyrie application',
  fn: ({ l, commands, args }) => new Promise((resolve, reject) => {
    const g = {};
    const notNullValidator = (val) => val !== '';
    const templatesPrefix = 'valkyrie-scaffolder-';
    const defaultTemplatePath = path.join(__dirname, '..', 'node_modules', 'valkyrie-scaffolder-default');
    const defaultTemplateListName = `default (${require(path.join(defaultTemplatePath, 'package.json')).version})`;

    //SCAFFOLDER SELECTION
    exec('npm root -g')
      .then(({ stdout }) => {
        g.npmGlobalPath = stdout.replace('\n', '');
        g.scaffolders = { [defaultTemplateListName] : {
          name: 'valkyrie-scaffolder-default',
          path: defaultTemplatePath
        } };
        return inquirer.prompt({
          type: 'list', name: 'scaffolder', message: 'select a template to scaffold you project:', choices: [
            defaultTemplateListName,
            ...fs.readdirSync(g.npmGlobalPath).reduce((acc, module)=> {
              if (module.substr(0, templatesPrefix.length) === templatesPrefix) {
                const templatePath = path.join(g.npmGlobalPath, module);
                const templateListName = `${module.substr(templatesPrefix.length, module.length)} (${require(path.join(templatePath, 'package.json')).version})`;
                g.scaffolders[templateListName] = {
                  name: module,
                  path: templatePath
                };
                acc.push(templateListName);
              }
              return acc;
            }, [])
          ]
        });
      })

      //TEMPLATE VARIABLES INPUT
      .then(({ scaffolder }) => {
        g.scaffolderPath = g.scaffolders[scaffolder].path;
        const defaultInputs = [
          { type: 'input', name: 'projectName', message: 'project name:', validate: notNullValidator, default: 'test' },
          { type: 'input', name: 'region', message: 'region name:', validate: notNullValidator, default: 'eu-west-1' },
        ];
        const { inputs: scaffolderInputs, source } = require(g.scaffolderPath);
        g.scaffolderSourcePath = path.join(g.scaffolderPath, source);
        const l = defaultInputs.length;
        return inquirer.prompt([
          ...defaultInputs,
          ...scaffolderInputs.filter(({ name }) => {
            for (let i = 0; i < l; i++) if (defaultInputs[i].name === name) return false;
            return true;
          })
        ]);
      })

      .then(answers => g.template = answers)

      //TEMPLATING AND SCAFFOLDING APPLICATION
      .then(() => {
        g.projectFolder = path.join(cwd, g.template.projectName);
        fs.mkdirSync(g.projectFolder);
        return listFiles(g.scaffolderSourcePath,
          (filePath, content) => {
            let fileName = filePath.replace(g.scaffolderSourcePath, '');
            fileName = fileName.replace('npmignore', 'gitignore');
            Object.entries(g.template).forEach(([key, value]) => {
              const re = new RegExp(`{{${key}}}`, 'g');
              content = content.replace(re, value);
            });
            fs.writeFileSync(path.join(g.projectFolder, fileName), content);
          },
          dirPath => fs.mkdirSync(path.join(path.join(cwd, subPath(dirPath, g.templateName))))
        );
      })
      .then(() => l.success(`project scaffolded in ${g.projectFolder}`))

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
          PolicyName: `valkyrie-${g.template.projectName}-lambda-policy`,
          Description: `Valkyrie "${g.template.projectName}" project policy attached to "valkyrie-${g.template.projectName}-lambda-role"`,
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
          RoleName: `valkyrie-${g.template.projectName}-lambda-role`,
          Description: `Valkyrie "${g.template.projectName}" project role assumed by "valkyrie-${g.template.projectName}-lambda"`,
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

      //todo VALKCONFIG CREATION

      //LAMBDA CREATION
      /*.then(() => {
        new AWS.Lambda({ region: g.template.region }).createFunction({
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
        g.apigateway = new AWS.APIGateway({ region: g.template.region });
        return g.apigateway.createRestApi({
          name: g.template.projectName,
          description: 'Valkyrie application'
        }).promise();
      })
      .then(({ id: restApiId }) => {
        g.restApiId = restApiId;
        l.success(`${g.template.projectName} API (id: ${g.restApiId}) created in ${g.template.region};`);
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
        type: 'AWS_PROXY',
        uri: `arn:aws:apigateway:${g.template.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:477398036046:function:aws-valkyrie-dev-lambda/invocations`
      }).promise())
      .then(resolve)
      .catch(err => {
        l.fail('creation process failed;');
        l.error(err);
        if (g.restApiId) {
          l.log('reverting modifications...');
          commands.delete.fn({ l, commands, args }, g)
            .then(() => reject(err))
            .catch(reject);
        } else {
          reject(err);
        }
      });
  })
};
