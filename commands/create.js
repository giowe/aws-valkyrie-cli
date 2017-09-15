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
    const vars = { };
    //todo check if valkconf is not already available
    const valkconfig = {
      Project: {},
      Iam: {},
      Api: {},
      Lambda: {}
    };
    const notNullValidator = (val) => val !== '';
    const templatesPrefix = 'valkyrie-scaffolder-';
    const defaultTemplatePath = path.join(__dirname, '..', 'node_modules', 'valkyrie-scaffolder-default');
    const defaultTemplateListName = `default (${require(path.join(defaultTemplatePath, 'package.json')).version})`;
    const saveValkconfig = () => fs.writeFileSync(path.join(vars.projectFolder, 'valkconfig.json'), JSON.stringify(valkconfig, null, 2));
    //SCAFFOLDER SELECTION
    exec('npm root -g')
      .then(({ stdout }) => {
        vars.npmGlobalPath = stdout.replace('\n', '');
        vars.scaffolders = { [defaultTemplateListName] : {
          name: 'valkyrie-scaffolder-default',
          path: defaultTemplatePath
        } };
        return inquirer.prompt({
          type: 'list', name: 'scaffolder', message: 'select a template to scaffold you project:', choices: [
            defaultTemplateListName,
            ...fs.readdirSync(vars.npmGlobalPath).reduce((acc, module)=> {
              if (module.substr(0, templatesPrefix.length) === templatesPrefix) {
                const templatePath = path.join(vars.npmGlobalPath, module);
                const templateListName = `${module.substr(templatesPrefix.length, module.length)} (${require(path.join(templatePath, 'package.json')).version})`;
                vars.scaffolders[templateListName] = {
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
        vars.scaffolderPath = vars.scaffolders[scaffolder].path;
        const defaultInputs = [
          { type: 'input', name: 'projectName', message: 'project name:', validate: notNullValidator, default: 'test' },
          { type: 'input', name: 'region', message: 'region name:', validate: notNullValidator, default: 'eu-west-1' },
          { type: 'input', name: 'description', message: 'description:' },
          { type: 'input', name: 'memorySize', message: 'lambda memory size:', validate: notNullValidator, default: '128' },
          { type: 'input', name: 'timeout', message: 'lambda timeout:', validate: notNullValidator, default: '3' },
          { type: 'input', name: 'runtime', message: 'lambda runtime:', validate: notNullValidator, default: 'nodejs6.10' }
        ];
        const { inputs: scaffolderInputs, source } = require(vars.scaffolderPath);
        vars.scaffolderSourcePath = path.join(vars.scaffolderPath, source);
        const l = defaultInputs.length;
        return inquirer.prompt([
          ...defaultInputs,
          ...scaffolderInputs.filter(({ name }) => {
            for (let i = 0; i < l; i++) if (defaultInputs[i].name === name) return false;
            return true;
          })
        ]);
      })

      .then(answers => {
        vars.template = answers;
        valkconfig.Project.Region = answers.region;
        Object.assign(valkconfig.Lambda, {
          FunctionName: `valkyrie-${answers.projectName}-lambda`,
          Description: answers.description,
          Handler: 'index.handler', //todo I have to do it programmatically from
          MemorySize: answers.memorySize,
          Timeout: answers.timeout,
          Runtime: answers.runtime
        });
      })

      //TEMPLATING AND SCAFFOLDING APPLICATION
      .then(() => {
        vars.projectFolder = path.join(cwd, vars.template.projectName);
        fs.mkdirSync(vars.projectFolder);
        return listFiles(vars.scaffolderSourcePath,
          (filePath, content) => {
            let fileName = filePath.replace(vars.scaffolderSourcePath, '');
            fileName = fileName.replace('npmignore', 'gitignore');
            Object.entries(vars.template).forEach(([key, value]) => {
              const re = new RegExp(`{{${key}}}`, 'g');
              content = content.replace(re, value);
            });
            fs.writeFileSync(path.join(vars.projectFolder, fileName), content);
          },
          dirPath => fs.mkdirSync(path.join(path.join(cwd, subPath(dirPath, vars.templateName))))
        );
      })
      .then(() => l.success(`project scaffolded in ${vars.projectFolder}`))

      //POLICY CREATION
      .then(() => {
        vars.iam = new AWS.IAM();
        return vars.iam.createPolicy({
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
          PolicyName: `valkyrie-${vars.template.projectName}-lambda-policy`,
          Description: `Valkyrie "${vars.template.projectName}" project policy attached to "valkyrie-${vars.template.projectName}-lambda-role"`,
          Path: '/valkyrie/'
        }).promise();
      })
      .then(({ Policy: { PolicyName: policyName, Arn: policyArn } }) => {
        valkconfig.Iam.PolicyArn = policyArn;
        vars.policyName = policyName;
        saveValkconfig();
        l.success(`${policyName} policy (arn: ${policyArn}) created;`);
      })

      //ROLE CREATION
      .then(() => {
        return vars.iam.createRole({
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
          RoleName: `valkyrie-${vars.template.projectName}-lambda-role`,
          Description: `Valkyrie "${vars.template.projectName}" project role assumed by "valkyrie-${vars.template.projectName}-lambda"`,
          Path: '/valkyrie/'
        }).promise();
      })
      .then(({ Role: { RoleName: roleName, Arn: roleArn } }) => {
        valkconfig.Iam.RoleName = roleName;
        valkconfig.Lambda.Role = roleArn;
        saveValkconfig();
        l.success(`${roleName} role (arn: ${roleArn}) created;`);
      })

      //ATTACHING POLICY
      .then(() => {
        vars.iam.attachRolePolicy({
          PolicyArn: valkconfig.Iam.PolicyArn,
          RoleName: valkconfig.Iam.RoleName
        }).promise();
      })
      .then(() => l.success(`${vars.policyName} attached to ${valkconfig.Iam.RoleName};`))

      //LAMBDA CREATION
      //.then(() => new AWS.Lambda({ region: valkconfig.Project.Region }).createFunction(Object.assign(valkconfig.lambda, { Code: { ZipFile: new Buffer() } }).promise()))
      //.then((data) => l.success(data))

      //API CREATION
      .then(() => {
        vars.apigateway = new AWS.APIGateway({ region: valkconfig.Project.Region });
        return vars.apigateway.createRestApi({
          name: vars.template.projectName,
          description: 'Valkyrie application'
        }).promise();
      })
      .then(({ id: restApiId }) => {
        valkconfig.Api.Id = restApiId;
        saveValkconfig();
        l.success(`${vars.template.projectName} API (id: ${restApiId}) created in ${valkconfig.Project.Region};`);
      })

      //RESOURCE CREATION
      .then(() => vars.apigateway.getResources({ restApiId: valkconfig.Api.Id }).promise())
      .then(({ items: [{ id: parentId }] }) => vars.apigateway.createResource({
        restApiId: valkconfig.Api.Id,
        parentId, pathPart: '{proxy+}'
      }).promise())
      .then(({ id: resourceId }) => {
        vars.resourceId = resourceId;
        l.success(`{proxy+} resource (id: ${resourceId}) created;`);
      })

      //METHOD CREATION
      .then(() => vars.apigateway.putMethod({
        authorizationType: 'NONE',
        httpMethod: 'ANY',
        resourceId: vars.resourceId,
        restApiId: valkconfig.Api.Id,
        apiKeyRequired: false,
        operationName: 'Valkyrie proxy'
      }).promise())
      .then(() => l.success('ANY method created;'))

      //ATTACHING LAMBDA
      .then(() => vars.apigateway.putIntegration({
        httpMethod: 'ANY',
        integrationHttpMethod: 'POST',
        resourceId: vars.resourceId,
        restApiId: valkconfig.Api.Id,
        type: 'AWS_PROXY',
        uri: `arn:aws:apigateway:${valkconfig.Project.Region}:lambda:path/2015-03-31/functions/arn:aws:lambda:eu-west-1:477398036046:function:aws-valkyrie-dev-lambda/invocations`
      }).promise())
      .then(() => {
        saveValkconfig();
        l.success(`Valkyrie ${vars.template.projectName} project successfully created:\n${JSON.stringify(valkconfig, null, 2)}`)
      })
      .then(resolve)
      .catch(err => {
        l.fail('creation process failed;');
        if (valkconfig.Api.Id) {
          l.error(err);
          l.log('reverting modifications...');
          return commands.delete.fn({ l, commands, args }, valkconfig);
        }
        return reject(err);
      })
      .then(resolve)
      .catch(reject);
  })
};
