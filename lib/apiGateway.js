const AWS = require("aws-sdk")
const { getLambdaInstance } = require("./lambda.js")
const { generateRetryFn, getAWSCredentials } = require("../utils.js")

const e = module.exports

let apiGateway
/**
 * Returns the API Gateway client instance and if not present, creates a new one
 * @param { string } region
 * @param { string } profile
 * @return { object } the api gateway client
 */
const getApiGatewayInstance = e.getApiGatewayInstance = (region, profile) => {
  if (apiGateway) {
    return apiGateway
  } else {
    const awsCredentials = { credentials: getAWSCredentials(profile), region }
    apiGateway = new AWS.APIGateway(awsCredentials)
    return apiGateway
  }
}

/**
 * Create an API Gateway api
 * @param { string } name
 * @param { string } region
 * @param { string } description
 * @param { string } profile
 */

e.createApi = (name, region, description, profile) => {
  const apiGateway = getApiGatewayInstance(region, profile)
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
      }).promise())()
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
      }).promise())()
    })
    .then(() => ({ apiId: state.apiId, resourceId: state.resourceId }))
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
e.attachLambdaToApi = (apiId, region, resourceId, functionArn, functionName, lambdaPolicyArn, profile) => {
  const apiGateway = getApiGatewayInstance(region, profile)
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
  }).promise())()
    .then(() => {
      return generateRetryFn(() => apiGateway.putIntegrationResponse({
        httpMethod: "ANY",
        resourceId,
        restApiId: apiId,
        statusCode: "200",
        responseTemplates: { "application/json": "{}" }
      }).promise())()
    })
    .then(() => {
      const lambda = getLambdaInstance(region, profile)
      return generateRetryFn(() => lambda.addPermission({
        Action: "lambda:InvokeFunction",
        FunctionName: functionName,
        Principal: "apigateway.amazonaws.com",
        SourceArn: `arn:aws:execute-api:${region}:${lambdaPolicyArn.split(":")[4]}:${apiId}/*/*/*`,
        StatementId: "ID-1"
      }).promise())()
    })
}

/**
 * Creates an API Gateway deployment
 * @param { string } apiId
 * @param { string } region
 * @param { string } stageName
 * @param { string } profile
 */
e.createDeployment = (apiId, region, stageName, profile) => {
  const apiGateway = getApiGatewayInstance(region, profile)
  return generateRetryFn(() => apiGateway.createDeployment({
    restApiId: apiId,
    stageName
  }).promise())()
}
