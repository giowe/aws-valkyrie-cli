'use strict';
const inquirer = require('inquirer');
const AWS = require('aws-sdk');
const del = require('del');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const zipdir = promisify(require('zip-dir'));
const path = require('path');
const fs = require('fs');
const { getAWSCredentials, listFiles, subPath } = require('../utils');
const cwd = process.cwd();

module.exports = {
  description: 'Create a new Valkyrie application',
  fn: ({ l, argv, commands }) => new Promise((resolve, reject) => {
    const vars = { };
    const valkconfig = {
      Project: {},
      Iam: {},
      Api: {},
      Lambda: {}
    };
    const awsCredentials = getAWSCredentials();
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
        const { inputs: scaffolderInputs, source, handler } = require(vars.scaffolderPath);
        vars.scaffolderSourcePath = path.join(vars.scaffolderPath, source);
        vars.handler = handler;
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
        vars.projectFolder = path.join(cwd, vars.template.projectName);
        valkconfig.Project.Region = answers.region;
        fs.mkdirSync(vars.projectFolder);
      })

      //ROLE CREATION
      .then(() => {
        vars.iam = new AWS.IAM(awsCredentials);
        return vars.iam.createRole({
          AssumeRolePolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
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
        vars.roleArn = roleArn;
        saveValkconfig();
        l.success(`${roleName} role (arn: ${roleArn}) created;`);
      })

      //POLICY CREATION
      .then(() => {
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

      //ATTACHING POLICY TO ROLE
      .then(() => {
        vars.iam.attachRolePolicy({
          PolicyArn: valkconfig.Iam.PolicyArn,
          RoleName: valkconfig.Iam.RoleName
        }).promise();
      })
      .then(() => l.success(`${vars.policyName} attached to ${valkconfig.Iam.RoleName};`))

      //TEMPLATING AND SCAFFOLDING APPLICATION
      .then(() => {
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

      //INSTALLING PACKAGES
      .then(() => {
        l.log('installing npm packages...');
        return exec(`npm install --prefix ${vars.projectFolder}`);
      })
      .then(() => {
        del.sync(path.join(vars.projectFolder, 'etc'), { force: true });
        l.success('project packages installed;');
      })

      //LAMBDA CREATION
      .then(() => zipdir(vars.projectFolder))
      .then(async (buffer) => {
        l.inlineLog(l.prefix, 'creating lambda function...');
        vars.lambdaConfig = {
          FunctionName: `valkyrie-${vars.template.projectName}-lambda`,
          Description: vars.template.description,
          Handler: vars.handler,
          MemorySize: vars.template.memorySize,
          Timeout: vars.template.timeout,
          Runtime: vars.template.runtime,
          Role: vars.roleArn
        };
        const params = Object.assign({ Code: { ZipFile: buffer } }, vars.lambdaConfig);
        const lambda = vars.lambda = new AWS.Lambda(Object.assign({ region: valkconfig.Project.Region }, awsCredentials));

        const wait = () => new Promise(resolve => setTimeout(resolve, 1000));
        const createLambda = async (maxRetries = 10) => {
          try {
            const result = await lambda.createFunction(params).promise();
            l.inlineLog('\n');
            return result;
          } catch(err) {
            if (maxRetries > 0) {
              l.inlineLog('.');
              await wait();
              return await createLambda(maxRetries -1);
            }
            else throw err;
          }
        };

        return await createLambda();
      })
      .then(({ FunctionName, FunctionArn }) => {
        vars.FunctionArn = FunctionArn;
        valkconfig.Lambda = vars.lambdaConfig;
        l.success(`${FunctionName} created;`);
      })

      //API CREATION
      .then(() => {
        vars.apiName = `valkyrie-${vars.template.projectName}-api`;
        vars.apigateway = new AWS.APIGateway(Object.assign({ region: valkconfig.Project.Region }, awsCredentials));
        return vars.apigateway.createRestApi({
          name: vars.apiName,
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
        requestParameters: { 'method.request.path.proxy': true },
        apiKeyRequired: false,
        operationName: 'Valkyrie proxy'
      }).promise())
      .then(() => l.success('ANY method created;'))

      //ATTACHING LAMBDA
      .then(() => vars.apigateway.putIntegration({
        httpMethod: 'ANY',
        resourceId: vars.resourceId,
        restApiId: valkconfig.Api.Id,
        type: 'AWS_PROXY',
        cacheKeyParameters: ['method.request.path.proxy'],
        integrationHttpMethod: 'POST',
        contentHandling: 'CONVERT_TO_TEXT',
        passthroughBehavior: 'WHEN_NO_MATCH',
        requestParameters: { 'integration.request.path.proxy': 'method.request.path.proxy' },
        uri: `arn:aws:apigateway:${valkconfig.Project.Region}:lambda:path/2015-03-31/functions/${vars.FunctionArn}/invocations`
      }).promise())
      .then(() => l.success(`${valkconfig.Lambda.FunctionName} attached to ${vars.apiName};`))

      //RESPONSE INTEGRATION
      .then(() => vars.apigateway.putIntegrationResponse({
        httpMethod: 'ANY',
        resourceId: vars.resourceId,
        restApiId: valkconfig.Api.Id,
        statusCode: '200',
        responseTemplates: { 'application/json': '{}' }
      }).promise())
      .then(() => l.success('response integrated;'))

      //ADDING PERMISSION TO LAMBDA TO BE CALLED FROM API GATEWAY
      .then(() => vars.lambda.addPermission({
        Action: 'lambda:InvokeFunction',
        FunctionName: valkconfig.Lambda.FunctionName,
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${valkconfig.Project.Region}:${valkconfig.Iam.PolicyArn.split(':')[4]}:${valkconfig.Api.Id}/*/*/*`,
        StatementId: 'ID-1'
      }).promise())
      .then(data => l.success('permission granted to lambda to be called from api-gateway;'))

      //DEPLOYMENT CREATION
      .then(() => vars.apigateway.createDeployment({
        restApiId: valkconfig.Api.Id,
        stageName: 'staging'
      }).promise())
      .then(() => l.success('staging deployiment created;'))

      .then(() => {
        saveValkconfig();
        l.success(`Valkyrie ${vars.template.projectName} project successfully created:\n${JSON.stringify(valkconfig, null, 2)}`);
        l.log(`${vars.apiName} is available at: ${l.colors.cyan}https://${valkconfig.Api.Id}.execute-api.eu-west-1.amazonaws.com/staging${l.colors.reset}`);
        resolve();
      })
      .catch(err => {
        l.fail('creation process failed;');
        l.error(err);
        if (!argv['no-revert']) {
          l.log('reverting modifications...');
          return commands.delete.fn({ l, argv, commands }, valkconfig);
        }
      })
      .then(resolve)
      .catch(reject);
  })
};
