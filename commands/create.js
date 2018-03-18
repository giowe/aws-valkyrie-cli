const inquirer = require('inquirer');
const {logger: l} = require('aws-valkyrie-utils');
const AWS = require('aws-sdk');
const del = require('del');
const {promisify} = require('util');
const validate = require('validate-npm-package-name');
const exec = promisify(require('child_process').exec);
const path = require('path');
const fs = require('fs');
const argv = require('simple-argv');
const urlJoin = require('url-join');
const cfScaffolder = require('valkyrie-cftemplate-scaffolder-default');
const {getAWSCredentials, listFiles, subPath, generateRetryFn, getEnvColor, getApiUrl, createDistZip} = require('../utils');
const cwd = process.cwd();

module.exports = {
  description: 'Creates a new Valkyrie application;',
  flags: [
    {
      name: 'profile',
      description: 'Uses a specific profile instead of the default one;'
    }
  ],
  fn: ({commands}) => new Promise((resolve, reject) => {
    const vars = {};
    const valkconfig = {
      Project: {},
      Environments: {}
    };
    const awsCredentials = {credentials: getAWSCredentials(argv.profile)};
    const codeTemplatePrefix = 'valkyrie-scaffolder-';
    const cfTemplatePrefix = 'valkyrie-cftemplate-scaffolder-';
    const saveValkconfig = () => fs.writeFileSync(path.join(vars.projectFolder, 'valkconfig.json'), JSON.stringify(valkconfig, null, 2));

    //SCAFFOLDER SELECTION
    //todo preinstall default code scaffolder
    //todo let the user pick from a cf non default scaffolder
    exec('npm root -g')
      .then(({stdout}) => {
        vars.npmGlobalPath = stdout.replace('\n', '');
        const scaffolders = vars.scaffolders = fs.readdirSync(vars.npmGlobalPath).reduce((acc, module)=> {
          [[codeTemplatePrefix, 'code'], [cfTemplatePrefix, 'cf']].forEach(([prefix, type]) => {
            if (prefix === module.substr(0, prefix.length)) {
              const templatePath = path.join(vars.npmGlobalPath, module);
              const templateListName = `${module.substr(prefix.length, module.length)} (${require(path.join(templatePath, 'package.json')).version})`;
              acc[type][templateListName] = {
                name: module,
                path: templatePath
              };
            }
          });

          return acc;
        }, {
          code: {
            [`default (${require(`${codeTemplatePrefix}default/package.json`).version})`]: {
              name: `${codeTemplatePrefix}default`,
              path: `${codeTemplatePrefix}default`
            }
          },
          cf: {
            [`default (${require(`${cfTemplatePrefix}default/package.json`).version})`]: {
              name: `${cfTemplatePrefix}default`,
              path: `${cfTemplatePrefix}default`
            }
          }
        });

        return inquirer.prompt([
          {type: 'list', name: 'codeScaffolder', message: 'select a code template to scaffold your project:', choices: Object.keys(scaffolders.code)},
          {type: 'list', name: 'cfScaffolder', message: 'select a cloud front template to scaffold your project:', choices: Object.keys(scaffolders.cf)}
        ]);
      })

      //TEMPLATE VARIABLES INPUT
      .then(({codeScaffolder, cfSfaccolder}) => {
        const {path: codeScaffolderPath} = vars.scaffolders.code[codeScaffolder];
        const {path: cfScaffolderPath} = vars.scaffolders.code[cfSfaccolder];

        vars.codeScaffolderPath = codeScaffolderPath;
        vars.cfScaffolderPath = cfScaffolderPath;

        const defaultInputs = [
          {type: 'input', name: 'projectName', message: 'project name:', default: argv._[1], validate: name => {
            const {validForNewPackages, warnings, errors} = validate(name);
            if (validForNewPackages) return true;
            const out = [];
            if (errors) out.push(...errors);
            if (warnings) out.push(...warnings);
            return `${out.join(', ')};`;
          }},
          {type: 'checkbox', name: 'environments', message: 'select which environment you want to generate:', choices: [{name: 'staging', checked: true}, {name: 'production', checked: true}], validate: (choices) => choices.length ? true : 'select at least one environment;'},
          {type: 'input', name: 'description', message: 'description:'},

          //{type: 'input', name: 'region', message: 'region name:', validate: notNullValidator, default: 'eu-west-1'},
          //{type: 'input', name: 'memorySize', message: 'Lambda memory size:', validate: notNullValidator, default: '128'},
          //{type: 'input', name: 'timeout', message: 'Lambda timeout:', validate: notNullValidator, default: '3'},
          //{type: 'input', name: 'runtime', message: 'Lambda runtime:', validate: notNullValidator, default: 'nodejs6.10'}
        ];
        const {inputs: codeScaffolderInputs, source, handler, root} = require(codeScaffolderPath);
        vars.scaffolderSourcePath = path.join(codeScaffolderPath, source);
        vars.handler = handler;
        vars.root = root;

        const l = defaultInputs.length;
        return inquirer.prompt([
          ...defaultInputs,
          ...codeScaffolderInputs.filter(({name}) => {
            for (let i = 0; i < l; i++) if (defaultInputs[i].name === name) return false;
            return true;
          })
        ]);
      })

      .then(answers => {
        vars.template = answers;
        vars.projectFolder = path.join(cwd, vars.template.projectName);
        vars.plural = answers.environments.length > 1;
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

      .then(() => {
        const {templates} = cfScaffolder;

        cfScaffolder.map((name, required, message, sources) => {
          const questions = [];
          if(!required) {
            questions.push({
              type: 'confirm',
              name: `${name}Confirm`,
              message,
              default: true //todo
            });
          }
          if(Array.isArray(sources)) {
            questions.push({
              type: 'checkbox',
              name: `${name}Source`,
              choices: sources.map(s => s.message),
              when: (answers) => {
                return required || answers[`${name}Confirm`];
              }
            });
          }
        });

        inquirer.prompt(templates.map(({name, required, message}) => ({
          message: `${message}${required ? ' (required)' : ''}`, name,
        })));
      })
      .then(() => {
        throw new Error('pause');
      })
      //ROLE CREATION
      .then(() => {
        vars.iam = new AWS.IAM(awsCredentials);
        l.wait(`creating role${vars.plural? 's' : ''}`);
        return Promise.all(vars.template.environments.map(env => generateRetryFn(() => vars.iam.createRole({
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
          RoleName: `${vars.template.projectName}-${env}-lambda`,
          Description: `Valkyrie "${vars.template.projectName}" project ${env} role assumed by "${vars.template.projectName}-${env}"`,
          Path: `/valkyrie/${env}/`
        }).promise())()));
      })
      .then(results => {
        results.forEach(({Role: {RoleName: roleName, Arn: roleArn}}, i) => {
          const env = vars.template.environments[i];
          valkconfig.Environments[env].Iam.RoleName = roleName;
          vars[env].roleArn = roleArn;
          l.success(`${roleName} role created; (arn: ${roleArn})`);
        });
        saveValkconfig();
      })

      //POLICY CREATION
      .then(() => {
        l.wait(`creating polic${vars.plural? 'ies' : 'y'}`);
        return Promise.all(vars.template.environments.map(env => generateRetryFn(() => vars.iam.createPolicy({
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
          PolicyName: `${vars.template.projectName}-${env}-lambda`,
          Description: `Valkyrie "${vars.template.projectName}" project ${env} policy attached to "${valkconfig.Environments[env].Iam.RoleName}"`,
          Path: `/valkyrie/${env}/`
        }).promise())()));
      })
      .then(results =>  {
        results.forEach(({Policy: {PolicyName: policyName, Arn: policyArn}}, i) => {
          const env = vars.template.environments[i];
          valkconfig.Environments[env].Iam.PolicyArn = policyArn;
          vars[env].policyName = policyName;
          l.success(`${policyName} policy created; (arn: ${policyArn})`);
        });
        saveValkconfig();
      })

      //ATTACHING POLICY TO ROLE
      .then(() => {
        l.wait(`attaching polic${vars.plural? 'ies' : 'y'} to role${vars.plural ? 's' : ''}`);
        Promise.all(vars.template.environments.map(env => generateRetryFn(() => vars.iam.attachRolePolicy({
          PolicyArn: valkconfig.Environments[env].Iam.PolicyArn,
          RoleName: valkconfig.Environments[env].Iam.RoleName
        }).promise())()));
      })
      .then(() => vars.template.environments.forEach(env => l.success(`${vars[env].policyName} policy attached to ${valkconfig.Environments[env].Iam.RoleName} role;`)))

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
        l.success('project packages installed;');
        return del(path.join(vars.projectFolder, 'etc'), {force: true});
      })

      //LAMBDA CREATION
      .then(() => createDistZip(vars.projectFolder))
      .then(buffer => {
        l.wait(`creating Lambda function${vars.plural? 's' : ''}`);
        const lambda = vars.lambda = new AWS.Lambda(Object.assign({region: valkconfig.Project.Region}, awsCredentials));
        return Promise.all(vars.template.environments.map(env => {
          vars[env].lambdaConfig = {
            FunctionName: `${vars.template.projectName}-${env}`,
            Description: vars.template.description,
            Handler: vars.handler,
            MemorySize: vars.template.memorySize,
            Timeout: vars.template.timeout,
            Runtime: vars.template.runtime,
            Role: vars[env].roleArn
          };
          return generateRetryFn(() => lambda.createFunction(Object.assign({Code: {ZipFile: buffer}}, vars[env].lambdaConfig)).promise(), 10)();
        }));
      })
      .then(results => results.forEach(({FunctionName, FunctionArn}, i) => {
        const env = vars.template.environments[i];
        vars[env].FunctionArn = FunctionArn;
        valkconfig.Environments[env].Lambda = vars[env].lambdaConfig;
        l.success(`${FunctionName} lambda created;`);
      }))

      //API CREATION
      .then(() => {
        vars.apigateway = new AWS.APIGateway(Object.assign({region: valkconfig.Project.Region}, awsCredentials));
        l.wait(`creating api gateway infrastructure${vars.plural? 's' : ''}`);
        return Promise.all(vars.template.environments.map(env => {
          vars[env].apiName = `${vars.template.projectName}-${env}`;
          return generateRetryFn(() => vars.apigateway.createRestApi({
            name: vars[env].apiName,
            description: 'Valkyrie application'
          }).promise(), 10)();
        }));
      })
      .then(results => {
        results.forEach(({id: restApiId}, i) => {
          const env = vars.template.environments[i];
          valkconfig.Environments[env].Api.Id = restApiId;
          l.success(`${vars[env].apiName} api (id: ${restApiId}) created in ${valkconfig.Project.Region};`);
        });
        saveValkconfig();
      })

      //RESOURCE CREATION
      .then(() => Promise.all(vars.template.environments.map(env => generateRetryFn(() => vars.apigateway.getResources({restApiId: valkconfig.Environments[env].Api.Id}).promise())())))
      .then(results => Promise.all(results.map(({items: [{id: parentId}]}, i) => {
        const env = vars.template.environments[i];
        l.wait(`creating api gateway proxy+ resource${vars.plural? 's' : ''}`);
        return generateRetryFn(() => vars.apigateway.createResource({
          restApiId: valkconfig.Environments[env].Api.Id,
          parentId,
          pathPart: '{proxy+}'
        }).promise())();
      })))
      .then(results => results.forEach(({id: resourceId}, i) => {
        const env = vars.template.environments[i];
        vars[env].resourceId = resourceId;
        l.success(`{proxy+} ${env} resource (id: ${resourceId}) created;`);
      }))

      //METHOD CREATION
      .then(() => {
        l.wait(`creating ANY method for {proxy+} resource${vars.plural? 's' : ''}`);
        return Promise.all(vars.template.environments.map(env => generateRetryFn(() => vars.apigateway.putMethod({
          authorizationType: 'NONE',
          httpMethod: 'ANY',
          resourceId: vars[env].resourceId,
          restApiId: valkconfig.Environments[env].Api.Id,
          requestParameters: {'method.request.path.proxy': true},
          apiKeyRequired: false,
          operationName: 'Valkyrie proxy'
        }).promise())()));
      })
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`${env} ANY method created;`))))

      //ATTACHING LAMBDA
      .then(() => {
        l.wait(`attaching Lambda function${vars.plural? 's' : ''} to api gateway endpoint${vars.plural? 's' : ''}`);
        return Promise.all(vars.template.environments.map(env => generateRetryFn(() => vars.apigateway.putIntegration({
          httpMethod: 'ANY',
          resourceId: vars[env].resourceId,
          restApiId: valkconfig.Environments[env].Api.Id,
          type: 'AWS_PROXY',
          cacheKeyParameters: ['method.request.path.proxy'],
          integrationHttpMethod: 'POST',
          contentHandling: 'CONVERT_TO_TEXT',
          passthroughBehavior: 'WHEN_NO_MATCH',
          requestParameters: {'integration.request.path.proxy': 'method.request.path.proxy'},
          uri: `arn:aws:apigateway:${valkconfig.Project.Region}:lambda:path/2015-03-31/functions/${vars[env].FunctionArn}/invocations`
        }).promise())()));
      })
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`${valkconfig.Environments[env].Lambda.FunctionName} lambda attached to ${vars[env].apiName} api;`))))

      //RESPONSE INTEGRATION
      .then(() => {
        l.wait(`adding api gateway response integration${vars.plural? 's' : ''}`);
        return Promise.all(vars.template.environments.map(env => generateRetryFn(() => vars.apigateway.putIntegrationResponse({
          httpMethod: 'ANY',
          resourceId: vars[env].resourceId,
          restApiId: valkconfig.Environments[env].Api.Id,
          statusCode: '200',
          responseTemplates: {'application/json': '{}'}
        }).promise())()));
      })
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`${env} api response integrated;`))))

      //ADDING PERMISSION TO LAMBDA TO BE CALLED FROM API GATEWAY
      .then(() => {
        l.wait(`adding permission to Lambda function${vars.plural? 's' : ''}`);
        return Promise.all(vars.template.environments.map(env => generateRetryFn(() => vars.lambda.addPermission({
          Action: 'lambda:InvokeFunction',
          FunctionName: valkconfig.Environments[env].Lambda.FunctionName,
          Principal: 'apigateway.amazonaws.com',
          SourceArn: `arn:aws:execute-api:${valkconfig.Project.Region}:${valkconfig.Environments[env].Iam.PolicyArn.split(':')[4]}:${valkconfig.Environments[env].Api.Id}/*/*/*`,
          StatementId: 'ID-1'
        }).promise())()));
      })
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`permission granted to ${env} Lambda to be called from api-gateway;`))))

      //DEPLOYMENT CREATION
      .then(() => {
        l.wait(`creating deployment${vars.plural? 's' : ''}`);
        return Promise.all(vars.template.environments.map(env => generateRetryFn(() => vars.apigateway.createDeployment({
          restApiId: valkconfig.Environments[env].Api.Id,
          stageName: env.toLowerCase()
        }).promise())()));
      })
      .then(() => Promise.all(vars.template.environments.map(env => l.success(`${env} deployment created;`))))

      .then(() => {
        saveValkconfig();
        l.success(`valkconfig.json:\n${JSON.stringify(valkconfig, null, 2)}`);
        l.success(`Valkyrie ${vars.template.projectName} project successfully created; the application is available at the following link${vars.template.environments.length > 1 ? 's' : ''}:`);
        Promise.all(vars.template.environments.map(env => l.log(`- ${env.toLowerCase()}: ${l.colors[getEnvColor(env)]}${urlJoin(getApiUrl(valkconfig, env), vars.root)}${l.colors.reset}`, {prefix: false})));
        resolve();
      })
      .catch(err => {
        l.fail('creation process failed;');
        l.error(err);
        if (!argv['no-revert']) {
          l.log('reverting modifications...');
          return commands.delete.fn({argv, commands}, valkconfig);
        }
      })
      .then(resolve)
      .catch(reject);
  })
};
