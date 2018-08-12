const { logger: l } = require("aws-valkyrie-utils")
const { role: { create: createRole, basicAssumeRolePolicy }, policy: { create: createPolicy, attachRolePolicy, basicLambdaPolicy } } = require("./iam.js")
const { create: createLambda } = require("./lambda.js")
const { create: createApi, attachLambdaToApi, createDeployment } = require("./apiGateway.js")
const { createDistZip } = require("../utils.js")
const e = module.exports

e.create = (projectName, projectFolder, lambdaTemplate, env, profile) => {
  l.log(`Creating ${env} environment:`)
  const valkconfig = {
    Iam: {},
    Lambda: {},
    Api: {}
  }
  const RoleName = `${projectName}-${env}-lambda`
  const state = {}
  l.wait("creating role...")
  return Promise.resolve()
  // ROLE CREATION
    .then(() => createRole(RoleName, `Valkyrie "${projectName}" project ${env} role assumed by "${projectName}-${env}"`, basicAssumeRolePolicy, `/valkyrie/${env}/`, profile))
    .then(({ Role: { RoleName: roleName, Arn: roleArn } }) => {
      valkconfig.Iam.RoleName = roleName
      state.roleArn = roleArn
      l.success(`${roleName} role created; (arn: ${roleArn})`)
    })
    // POLICY CREATION
    .then(() => {
      l.wait("creating policy...")
      return createPolicy(`${projectName}-${env}-lambda`, `Valkyrie "${projectName}" project ${env} policy attached to "${valkconfig.Iam.RoleName}"`, basicLambdaPolicy, `/valkyrie/${env}/`, profile)
    })
    .then(({ Policy: { PolicyName: policyName, Arn: policyArn } }) => {
      valkconfig.Iam.PolicyArn = policyArn
      state.policyName = policyName
      l.success(`${policyName} policy created; (arn: ${policyArn})`)
    })
    //ATTACHING POLICY TO ROLE
    .then(() => {
      l.wait("attaching policy to role...")
      return attachRolePolicy(valkconfig.Iam.PolicyArn, valkconfig.Iam.RoleName, profile)
    })
    .then(() => l.success(`${state.policyName} policy attached to ${valkconfig.Iam.RoleName} role;`))
    //LAMBDA CREATION
    .then(() => createDistZip(projectFolder))
    .then(buffer => {
      l.wait("creating Lambda function...")
      const functionName = `${projectName}-${env}`
      const { description, handler, memorySize, timeout, runtime, region } = lambdaTemplate
      const { roleArn } = state
      valkconfig.Lambda = {
        FunctionName: functionName,
        Description: description,
        Handler: handler,
        MemorySize: memorySize,
        Timeout: timeout,
        Runtime: runtime,
        Role: roleArn
      }
      return createLambda(functionName, region, description, handler, memorySize, timeout, runtime, roleArn, buffer, profile)
    })
    .then(({ FunctionName, FunctionArn }) => {
      state.functionArn = FunctionArn
      l.success(`${FunctionName} lambda created;`)
    })
    //API CREATION
    .then(() => {
      l.wait("creating api gateway infrastructure...")
      const apiName = state.apiName = `${projectName}-${env}`
      return createApi(apiName, lambdaTemplate.region, "Valkyrie application", profile)
    })
    .then(({ apiId, resourceId }) => {
      valkconfig.Api.Id = apiId
      state.resourceId = resourceId
      l.success(`${state.apiName} api gateway infrastructure created;`)
    })
    //ATTACHING LAMBDA
    .then(() => {
      l.wait("attaching Lambda function to api gateway endpoint")
      return attachLambdaToApi(valkconfig.Api.Id, lambdaTemplate.region, state.resourceId, state.functionArn, valkconfig.Lambda.FunctionName, valkconfig.Iam.PolicyArn, profile)
    })
    .then(() => {
      l.success(`${valkconfig.Lambda.FunctionName} lambda attached to ${state.apiName} api;`)
    })
    // DEPLOYMENT CREATION
    .then(() => {
      l.wait("creating deployment...")
      return createDeployment(valkconfig.Api.Id, lambdaTemplate.region, env.toLowerCase(), profile)
    })
    .then(() => {
      l.success("deployment created;")
      return valkconfig
    })
}
