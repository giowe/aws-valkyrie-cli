const { getLambdaInstance } = require("./lambda.js")
const { generateRetryFn, getServiceInstance } = require("../utils.js")

const e = module.exports = { api: {} }

/**
 * Returns the API Gateway client instance and if not present, creates a new one
 * @param { string } region
 * @param { string } profile
 * @return { object } the api gateway client
 */
const getApiGatewayInstance = e.getApiGatewayInstance = getServiceInstance("APIGateway")

/**
 * Create an API Gateway api
 * @param { string } name
 * @param { string } region
 * @param { string } description
 * @param { string } profile
 */

e.api.create = (name, region, description, credentials) => {
  const apiGateway = getApiGatewayInstance(credentials, region)
  const state = {}
  return generateRetryFn(() => apiGateway.createRestApi({
    name,
    description
  }).promise(), 10)()
    .then(({ id: apiId }) => {
      state.apiId = apiId
      return generateRetryFn(() => apiGateway.getResources({
        restApiId: apiId
      }).promise(), 10)()
    })
    .then(({ items: [{ id: parentId }] }) => {
      return generateRetryFn(() => apiGateway.createResource({
        restApiId: state.apiId,
        parentId,
        pathPart: "{proxy+}"
      }).promise(), 10)()
    })
    .then(({ id: resourceId }) => {
      state.resourceId = resourceId
      return generateRetryFn(() => apiGateway.putMethod({
        authorizationType: "NONE",
        httpMethod: "ANY",
        resourceId,
        restApiId: state.apiId,
        requestParameters: { "method.request.path.proxy": true },
        apiKeyRequired: false,
        operationName: "Valkyrie proxy"
      }).promise(), 10)()
    })
    .then(() => ({ apiId: state.apiId, resourceId: state.resourceId }))
}

e.api.delete = (apiId, region, credentials) => {
  const apiGateway = getApiGatewayInstance(credentials, region)
  return generateRetryFn(() => {
    return apiGateway.deleteRestApi({ restApiId: apiId }).promise()
  }, 30)()
}

/**
 * Attach a lambda to the specified API Gateway resource
 * @param { string } apiId
 * @param { string } region
 * @param { string } resourceId
 * @param { string } functionArn
 * @param { string } functionName
 * @param { string } lambdaPolicyArn
 * @param { string } profile
 */
e.attachLambdaToApi = (apiId, region, resourceId, functionArn, functionName, lambdaPolicyArn, credentials) => {
  const apiGateway = getApiGatewayInstance(credentials, region)
  return generateRetryFn(() => apiGateway.putIntegration({
    httpMethod: "ANY",
    resourceId,
    restApiId: apiId,
    type: "AWS_PROXY",
    cacheKeyParameters: ["method.request.path.proxy"],
    integrationHttpMethod: "POST",
    contentHandling: "CONVERT_TO_TEXT",
    passthroughBehavior: "WHEN_NO_MATCH",
    requestParameters: { "integration.request.path.proxy": "method.request.path.proxy" },
    uri: `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${functionArn}/invocations`
  }).promise(), 10)()
    .then(() => {
      return generateRetryFn(() => apiGateway.putIntegrationResponse({
        httpMethod: "ANY",
        resourceId,
        restApiId: apiId,
        statusCode: "200",
        responseTemplates: { "application/json": "{}" }
      }).promise(), 10)()
    })
    .then(() => {
      const lambda = getLambdaInstance(credentials, region)
      return generateRetryFn(() => lambda.addPermission({
        Action: "lambda:InvokeFunction",
        FunctionName: functionName,
        Principal: "apigateway.amazonaws.com",
        SourceArn: `arn:aws:execute-api:${region}:${lambdaPolicyArn.split(":")[4]}:${apiId}/*/*/*`,
        StatementId: "ID-1"
      }).promise(), 10)()
    })
}

/**
 * Creates an API Gateway deployment
 * @param { string } apiId
 * @param { string } region
 * @param { string } stageName
 * @param { string } profile
 */
e.createDeployment = (apiId, region, stageName, credentials) => {
  const apiGateway = getApiGatewayInstance(credentials, region)
  return generateRetryFn(() => apiGateway.createDeployment({
    restApiId: apiId,
    stageName
  }).promise(), 10)()
}
