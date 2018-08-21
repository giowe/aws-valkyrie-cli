const { getServiceInstance, generateRetryFn } = require("../utils")

const e = module.exports

/**
 * Returns the Lambda client instance and if not present, creates a new one
 * @param { string } region
 * @param { string } profile
 */
const getLambdaInstance = e.getLambdaInstance = getServiceInstance("Lambda")

/**
 * Creates a new Lambda function
 * @param { string } functionName
 * @param { string } region
 * @param { string } description
 * @param { string } handler
 * @param { number } memorySize
 * @param { number } timeout
 * @param { string } runtime
 * @param { string } roleArn
 * @param { string } distBuffer
 * @param { string } profile
 */
e.create = (functionName, region, description, handler, memorySize, timeout, runtime, roleArn, distBuffer, credentials) => {
  const lambda = getLambdaInstance(credentials, region)
  return generateRetryFn(() => {
    return lambda.createFunction({
      FunctionName: functionName,
      Description: description,
      Handler: handler,
      MemorySize: memorySize,
      Timeout: timeout,
      Runtime: runtime,
      Role: roleArn,
      Code: { ZipFile: distBuffer }
    }).promise()
  }, 10)()
}

e.delete = (functionName, region, credentials) => {
  const lambda = getLambdaInstance(credentials, region)
  return generateRetryFn(() => {
    return lambda.deleteFunction({ FunctionName: functionName }).promise()
  }, 10)()
}

e.updateConfiguration = (functionName, configuration, credentials, region) => {
  const lambda = getLambdaInstance(credentials, region)

  return generateRetryFn(() => {
    const params = Object.assign(configuration, { FunctionName: functionName })
    return lambda.updateFunctionConfiguration(params).promise()
  }, 10)()
}
