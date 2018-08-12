const {logger: l} = require('aws-valkyrie-utils');
const {colors} = l;
const proxyLocal = require('aws-apigateway-proxy-local');
const path = require('path');
const fs = require('fs');
const argv = require('simple-argv');
const inquirer = require('inquirer');
const AWS = require('aws-sdk');
const urlJoin = require('url-join');
const cwd = process.cwd();
const {getProjectInfo, getAWSCredentials, generateRetryFn, createDistZip, getEnvColor, getApiUrl} = require('../utils');
const {createEnvRole, createEnvPolicy} = require('../lib/iam.js');
const { templateQuestions: lambdaTemplateQuestions } = require('../lib/lambda.js');

const notNullValidator = (val) => val === '' ? 'required field;' : true;

module.exports = {
  description: 'Add a new environment to your Valkyrie application;',
  flags: [
    {
      name: 'profile',
      description: 'Uses a specific profile instead of the default one;'
    }
  ],
  fn: ({commands}) => new Promise((resolve, reject) => {
    const {valkconfig, pkg} = getProjectInfo();
    const awsCredentials = {credentials: getAWSCredentials(argv.profile)};
    const vars = {
      projectFolder: cwd
    };
    inquirer.prompt([
      {type: 'input', name: 'name', message: 'name:'},
      ...lambdaTemplateQuestions,
      {type: 'input', name: 'handler', message: 'Lambda handler:', validate: notNullValidator, default: 'index.handler'},
      {type: 'list', name: 'envColor', message: 'color:', choices: Object.keys(colors).filter(color => color !== 'bg' && color !== 'reset').map(color => ({name: `${colors[color]}${color}${colors.reset}`, value: color}))},
      {type: 'confirm', name: 'requiredConfirm', message: 'require confirmation on update:'}
    ])
      .then(({name: envName, handler, envColor, requiredConfirm, memorySize, timeout, runtime, description}) => {
        if (valkconfig.Environments[envName]) {
          throw new Error(`${envName} environment already exists`);
        }
        vars.envName = envName;
        Object.assign(vars, {description, envName, memorySize, timeout, runtime, handler});
        valkconfig.Environments[envName] = { Iam: {}, Lambda: {}, Api: {}, EnvColor: envColor, Confirm: requiredConfirm};
        vars[vars.envName] = {};
        vars.iam = new AWS.IAM(awsCredentials);
        l.wait('creating role');
        return generateRetryFn(() => createEnvRole(vars.iam, pkg.name, envName))();
      })
      .then(({Role: {RoleName: roleName, Arn: roleArn}}) => {
        valkconfig.Environments[vars.envName].Iam.RoleName = roleName;
        vars[vars.envName].roleArn = roleArn;
        l.success(`${roleName} role created; (arn: ${roleArn})`);
        l.wait(`creating polic${vars.plural? 'ies' : 'y'}`);
        return generateRetryFn(() => createEnvPolicy(vars.iam, pkg.name, vars.envName, roleName))();
      })
      .then(({Policy: {PolicyName: policyName, Arn: policyArn}}) =>  {
        valkconfig.Environments[vars.envName].Iam.PolicyArn = policyArn;
        vars[vars.envName].policyName = policyName;
        l.success(`${policyName} policy created; (arn: ${policyArn})`);
        l.wait(`attaching polic${vars.plural? 'ies' : 'y'} to role${vars.plural ? 's' : ''}`);
        return generateRetryFn(() => vars.iam.attachRolePolicy({
          PolicyArn: valkconfig.Environments[vars.envName].Iam.PolicyArn,
          RoleName: valkconfig.Environments[vars.envName].Iam.RoleName
        }).promise())();
      })
      .then(() => {
        l.success(`${vars[vars.envName].policyName} policy attached to ${valkconfig.Environments[vars.envName].Iam.RoleName} role;`);
      })

      //LAMBDA CREATION
      .then(() => createDistZip(vars.projectFolder))
      .then(buffer => {
        l.wait('creating Lambda function');
        const lambda = vars.lambda = new AWS.Lambda(Object.assign({region: valkconfig.Project.Region}, awsCredentials));
        vars[vars.envName].lambdaConfig = {
          FunctionName: `${pkg.name}-${vars.envName}`,
          Description: vars.description,
          Handler: vars.handler,
          MemorySize: vars.memorySize,
          Timeout: vars.timeout,
          Runtime: vars.runtime,
          Role: vars[vars.envName].roleArn
        };
        return generateRetryFn(() => lambda.createFunction(Object.assign({Code: {ZipFile: buffer}}, vars[vars.envName].lambdaConfig)).promise(), 10)();
      })
      .then(({FunctionName, FunctionArn}) => {
        vars[vars.envName].FunctionArn = FunctionArn;
        valkconfig.Environments[vars.envName].Lambda = vars[vars.envName].lambdaConfig;
        l.success(`${FunctionName} lambda created;`);
      })

      //API CREATION
      .then(() => {
        vars.apigateway = new AWS.APIGateway(Object.assign({region: valkconfig.Project.Region}, awsCredentials));
        l.wait('creating api gateway infrastructure');
        vars[vars.envName].apiName = `${pkg.name}-${vars.envName}`;
        return generateRetryFn(() => vars.apigateway.createRestApi({
          name: vars[vars.envName].apiName,
          description: 'Valkyrie application'
        }).promise(), 10)();
      })
      .then(({id: restApiId}) => {
        valkconfig.Environments[vars.envName].Api.Id = restApiId;
        l.success(`${vars[vars.envName].apiName} api (id: ${restApiId}) created in ${valkconfig.Project.Region};`);
      })

      //RESOURCE CREATION
      .then(() => generateRetryFn(() => vars.apigateway.getResources({restApiId: valkconfig.Environments[vars.envName].Api.Id}).promise())())
      .then(({items: [{id: parentId}]}) => {
        l.wait('creating api gateway proxy+ resource');
        return generateRetryFn(() => vars.apigateway.createResource({
          restApiId: valkconfig.Environments[vars.envName].Api.Id,
          parentId,
          pathPart: '{proxy+}'
        }).promise())();
      })
      .then(({id: resourceId}) => {
        vars[vars.envName].resourceId = resourceId;
        l.success(`{proxy+} ${vars.envName} resource (id: ${resourceId}) created;`);
      })

      //METHOD CREATION
      .then(() => {
        l.wait('creating ANY method for {proxy+} resource');
        return generateRetryFn(() => vars.apigateway.putMethod({
          authorizationType: 'NONE',
          httpMethod: 'ANY',
          resourceId: vars[vars.envName].resourceId,
          restApiId: valkconfig.Environments[vars.envName].Api.Id,
          requestParameters: {'method.request.path.proxy': true},
          apiKeyRequired: false,
          operationName: 'Valkyrie proxy'
        }).promise())();
      })
      .then(() => {
        l.success(`${vars.envName} ANY method created;`);
      })

      //ATTACHING LAMBDA
      .then(() => {
        l.wait('attaching Lambda function to api gateway endpoint');
        return generateRetryFn(() => vars.apigateway.putIntegration({
          httpMethod: 'ANY',
          resourceId: vars[vars.envName].resourceId,
          restApiId: valkconfig.Environments[vars.envName].Api.Id,
          type: 'AWS_PROXY',
          cacheKeyParameters: ['method.request.path.proxy'],
          integrationHttpMethod: 'POST',
          contentHandling: 'CONVERT_TO_TEXT',
          passthroughBehavior: 'WHEN_NO_MATCH',
          requestParameters: {'integration.request.path.proxy': 'method.request.path.proxy'},
          uri: `arn:aws:apigateway:${valkconfig.Project.Region}:lambda:path/2015-03-31/functions/${vars[vars.envName].FunctionArn}/invocations`
        }).promise())();
      })
      .then(() => {
        l.success(`${valkconfig.Environments[vars.envName].Lambda.FunctionName} lambda attached to ${vars[vars.envName].apiName} api;`);
      })

      //RESPONSE INTEGRATION
      .then(() => {
        l.wait('adding api gateway response integration');
        return generateRetryFn(() => vars.apigateway.putIntegrationResponse({
          httpMethod: 'ANY',
          resourceId: vars[vars.envName].resourceId,
          restApiId: valkconfig.Environments[vars.envName].Api.Id,
          statusCode: '200',
          responseTemplates: {'application/json': '{}'}
        }).promise())();
      })
      .then(() => {
        l.success(`${vars.envName} api response integrated;`);
      })

      //ADDING PERMISSION TO LAMBDA TO BE CALLED FROM API GATEWAY
      .then(() => {
        l.wait('adding permission to Lambda function');
        return generateRetryFn(() => vars.lambda.addPermission({
          Action: 'lambda:InvokeFunction',
          FunctionName: valkconfig.Environments[vars.envName].Lambda.FunctionName,
          Principal: 'apigateway.amazonaws.com',
          SourceArn: `arn:aws:execute-api:${valkconfig.Project.Region}:${valkconfig.Environments[vars.envName].Iam.PolicyArn.split(':')[4]}:${valkconfig.Environments[vars.envName].Api.Id}/*/*/*`,
          StatementId: 'ID-1'
        }).promise())();
      })
      .then(() => {
        l.success(`permission granted to ${vars.envName} Lambda to be called from api-gateway;`);
      })

      //DEPLOYMENT CREATION
      .then(() => {
        l.wait('creating deployment');
        return generateRetryFn(() => vars.apigateway.createDeployment({
          restApiId: valkconfig.Environments[vars.envName].Api.Id,
          stageName: vars.envName.toLowerCase()
        }).promise())();
      })
      .then(() => {
        l.success(`${vars.envName} deployment created;`);
      })
      .then(() => {
        l.success(`valkconfig.json:\n${JSON.stringify(valkconfig, null, 2)}`);
        fs.writeFileSync(path.join(cwd, 'valkconfig.json'), JSON.stringify(valkconfig, null, 2));
        l.success(`Valkyrie ${vars.envName} successfully created;`);
        l.log(`- ${vars.envName.toLowerCase()}: ${l.colors[getEnvColor(valkconfig, vars.envName)]}${urlJoin(getApiUrl(valkconfig, vars.envName), vars.root)}${l.colors.reset}`, {prefix: false});
        return resolve();
      })
      .catch(err => {
        l.fail('creation process failed;');
        l.error(err);
      })
      .then(resolve)
      .catch(reject);
  })
};
