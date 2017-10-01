'use strict';
const inquirer = require('inquirer');
const AWS = require('aws-sdk');
const del = require('del');
const { promisify } = require('util');
const validate = require('validate-npm-package-name');
const exec = promisify(require('child_process').exec);
const zipdir = promisify(require('zip-dir'));
const path = require('path');
const fs = require('fs');
const argv = require('simple-argv');
const { getAWSCredentials, listFiles, subPath, joinUrl, generateRetryFn, getEnvColor } = require('../utils');
const cwd = process.cwd();

module.exports = {
  description: 'Create a new Valkyrie application',
  fn: ({ l, commands }) => new Promise((resolve, reject) => {
    const vars = { };
    const valkconfig = {
      Project: {},
      Environments: {}
    };
    const awsCredentials = { credentials: getAWSCredentials() };
    const notNullValidator = (val) => val === '' ? 'required field;' : true;
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
          type: 'list', name: 'scaffolder', message: 'select a template to scaffold your project:', choices: [
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
          { type: 'input', name: 'projectName', message: 'project name:', default: argv._[1], validate: (name => {
            const { validForNewPackages, warnings, errors } = validate(name);
            if (validForNewPackages) return true;
            const out = [];
            if (errors) out.push(...errors);
            if (warnings) out.push(...warnings);
            return `${out.join(', ')};`;
          }) },
          { type: 'checkbox', name: 'environments', message: 'select which environment you want to generate:', choices: [{ name: 'staging', checked: true }, { name: 'production', checked: true }], validate: (choices) => choices.length ? true : 'select at least one environment;' },
          { type: 'input', name: 'region', message: 'region name:', validate: notNullValidator, default: 'eu-west-1' },
          { type: 'input', name: 'description', message: 'description:' },
          { type: 'input', name: 'memorySize', message: 'Lambda memory size:', validate: notNullValidator, default: '128' },
          { type: 'input', name: 'timeout', message: 'Lambda timeout:', validate: notNullValidator, default: '3' },
          { type: 'input', name: 'runtime', message: 'Lambda runtime:', validate: notNullValidator, default: 'nodejs6.10' }
        ];
        const { inputs: scaffolderInputs, source, handler, root } = require(vars.scaffolderPath);
        vars.scaffolderSourcePath = path.join(vars.scaffolderPath, source);
        vars.handler = handler;
        vars.root = root;
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
        valkconfig.Environments = {};
        vars.template.environments.forEach(env => {
          valkconfig.Environments[env] = {
            Iam: {},
            Api: {},
            Lambda: {}
          };
          vars[env] = {};
        });
        fs.mkdirSync(vars.projectFolder);
      })

      //ROLE CREATION
      .then(() => {
        vars.iam = new AWS.IAM(awsCredentials);
        return Promise.all(vars.template.environments.map(env => vars.iam.createRole({
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
          RoleName: `valkyrie-${vars.template.projectName}-${env}-lambda-role`,
          Description: `Valkyrie "${vars.template.projectName}" project ${env} role assumed by "valkyrie-${vars.template.projectName}-${env}-lambda"`,
          Path: `/valkyrie/${env}/`
        }).promise()));
      })
      .then(results => {
        results.forEach(({ Role: { RoleName: roleName, Arn: roleArn } }, i) => {
          const env = vars.template.environments[i];
          valkconfig.Environments[env].Iam.RoleName = roleName;
          vars[env].roleArn = roleArn;
          l.success(`${roleName} role (arn: ${roleArn}) created;`);
        });
        saveValkconfig();
      })

      //POLICY CREATION
      .then(() => Promise.all(vars.template.environments.map(env => vars.iam.createPolicy({
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
        PolicyName: `valkyrie-${vars.template.projectName}-${env}-lambda-policy`,
        Description: `Valkyrie "${vars.template.projectName}" project ${env} policy attached to "${valkconfig.Environments[env].Iam.RoleName}"`,
        Path: `/valkyrie/${env}/`
      }).promise())))
      .then(results =>  {
        results.forEach(({ Policy: { PolicyName: policyName, Arn: policyArn } }, i) => {
          const env = vars.template.environments[i];
          valkconfig.Environments[env].Iam.PolicyArn = policyArn;
          vars[env].policyName = policyName;
          l.success(`${policyName} policy (arn: ${policyArn}) created;`);
        });
        saveValkconfig();
      })

      //ATTACHING POLICY TO ROLE
      .then(() => Promise.all(vars.template.environments.map(env => vars.iam.attachRolePolicy({
        PolicyArn: valkconfig.Environments[env].Iam.PolicyArn,
        RoleName: valkconfig.Environments[env].Iam.RoleName
      }).promise())))
      .then(() => vars.template.environments.forEach(env => l.success(`${vars[env].policyName} attached to ${valkconfig.Environments[env].Iam.RoleName};`)))

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
        l.wait('installing npm packages');
        return exec(`npm install --prefix ${vars.projectFolder}`);
      })
      .then(() => {
        del.sync(path.join(vars.projectFolder, 'etc'), { force: true });
        l.success('project packages installed;');
      })

      //LAMBDA CREATION
      .then(() => zipdir(vars.projectFolder))
      .then(buffer => {
        l.wait(`creating Lambda function${vars.template.environments.length > 1 ? 's' : ''}`);
        const lambda = vars.lambda = new AWS.Lambda(Object.assign({ region: valkconfig.Project.Region }, awsCredentials));
        return Promise.all(vars.template.environments.map(async (env) => {
          vars[env].lambdaConfig = {
            FunctionName: `valkyrie-${vars.template.projectName}-${env}-lambda`,
            Description: vars.template.description,
            Handler: vars.handler,
            MemorySize: vars.template.memorySize,
            Timeout: vars.template.timeout,
            Runtime: vars.template.runtime,
            Role: vars[env].roleArn
          };
          const createLambda = generateRetryFn(() => lambda.createFunction(Object.assign({ Code: { ZipFile: buffer } }, vars[env].lambdaConfig)).promise());
          return await createLambda();
        }));
      })
      .then(results => results.forEach(({ FunctionName, FunctionArn }, i) => {
        const env = vars.template.environments[i];
        vars[env].FunctionArn = FunctionArn;
        valkconfig.Environments[env].Lambda = vars[env].lambdaConfig;
        l.success(`${FunctionName} created;`);
      }))

      //API CREATION
      .then(() => {
        vars.apigateway = new AWS.APIGateway(Object.assign({ region: valkconfig.Project.Region }, awsCredentials));
        return Promise.all(vars.template.environments.map(env => {
          vars[env].apiName = `valkyrie-${vars.template.projectName}-${env}-api`;
          return vars.apigateway.createRestApi({
            name: vars[env].apiName,
            description: 'Valkyrie application'
          }).promise();
        }));
      })
      .then(results => {
        results.forEach(({ id: restApiId }, i) => {
          const env = vars.template.environments[i];
          valkconfig.Environments[env].Api.Id = restApiId;
          l.success(`${vars.template.projectName} ${env} API (id: ${restApiId}) created in ${valkconfig.Project.Region};`);
        });
        saveValkconfig();
      })

      //RESOURCE CREATION
      .then(() => Promise.all(vars.template.environments.map(env => vars.apigateway.getResources({ restApiId: valkconfig.Environments[env].Api.Id }).promise())))
      .then(results => Promise.all(results.map(({ items: [{ id: parentId }] }, i) => {
        const env = vars.template.environments[i];
        return vars.apigateway.createResource({
          restApiId: valkconfig.Environments[env].Api.Id,
          parentId,
          pathPart: '{proxy+}'
        }).promise();
      })))
      .then(results => results.forEach(({ id: resourceId }, i) => {
        const env = vars.template.environments[i];
        vars[env].resourceId = resourceId;
        l.success(`{proxy+} ${env} resource (id: ${resourceId}) created;`);
      }))

      //METHOD CREATION
      .then(() => Promise.all(vars.template.environments.map(env => vars.apigateway.putMethod({
        authorizationType: 'NONE',
        httpMethod: 'ANY',
        resourceId: vars[env].resourceId,
        restApiId: valkconfig.Environments[env].Api.Id,
        requestParameters: { 'method.request.path.proxy': true },
        apiKeyRequired: false,
        operationName: 'Valkyrie proxy'
      }).promise())))
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`${env} ANY method created;`))))

      //ATTACHING LAMBDA
      .then(() => Promise.all(vars.template.environments.map(env => vars.apigateway.putIntegration({
        httpMethod: 'ANY',
        resourceId: vars[env].resourceId,
        restApiId: valkconfig.Environments[env].Api.Id,
        type: 'AWS_PROXY',
        cacheKeyParameters: ['method.request.path.proxy'],
        integrationHttpMethod: 'POST',
        contentHandling: 'CONVERT_TO_TEXT',
        passthroughBehavior: 'WHEN_NO_MATCH',
        requestParameters: { 'integration.request.path.proxy': 'method.request.path.proxy' },
        uri: `arn:aws:apigateway:${valkconfig.Project.Region}:lambda:path/2015-03-31/functions/${vars[env].FunctionArn}/invocations`
      }).promise())))
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`${valkconfig.Environments[env].Lambda.FunctionName} attached to ${vars[env].apiName};`))))

      //RESPONSE INTEGRATION
      .then(() => Promise.all(vars.template.environments.map(env => vars.apigateway.putIntegrationResponse({
        httpMethod: 'ANY',
        resourceId: vars[env].resourceId,
        restApiId: valkconfig.Environments[env].Api.Id,
        statusCode: '200',
        responseTemplates: { 'application/json': '{}' }
      }).promise())))
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`${env} api response integrated;`))))

      //ADDING PERMISSION TO LAMBDA TO BE CALLED FROM API GATEWAY
      .then(() => Promise.all(vars.template.environments.map(env => vars.lambda.addPermission({
        Action: 'lambda:InvokeFunction',
        FunctionName: valkconfig.Environments[env].Lambda.FunctionName,
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${valkconfig.Project.Region}:${valkconfig.Environments[env].Iam.PolicyArn.split(':')[4]}:${valkconfig.Environments[env].Api.Id}/*/*/*`,
        StatementId: 'ID-1'
      }).promise())))
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`permission granted to ${env} Lambda to be called from api-gateway;`))))

      //DEPLOYMENT CREATION
      .then(() => Promise.all(vars.template.environments.map(env => vars.apigateway.createDeployment({
        restApiId: valkconfig.Environments[env].Api.Id,
        stageName: env.toLowerCase()
      }).promise())))
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`${env} deployment created;`))))

      .then(() => {
        saveValkconfig();
        l.success(`valkconfig.json:\n${JSON.stringify(valkconfig, null, 2)}`);
        l.success(`Valkyrie ${vars.template.projectName} project successfully created; the application is available at the following link${vars.template.environments.length > 1 ? 's' : ''}:`);
        Promise.all(vars.template.environments.map(env => l.log(`- ${l.leftPad(`${env.toLowerCase()}:`, 11)} ${l.colors[getEnvColor(env)]}${joinUrl(`https://${valkconfig.Environments[env].Api.Id}.execute-api.eu-west-1.amazonaws.com/${env.toLowerCase()}`, vars.root)}${l.colors.reset}`, { prefix: false })));
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
