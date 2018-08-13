const { notNullValidator, generateRetryFn, getAWSCredentials } = require("../utils")
const AWS = require("aws-sdk")

const e = module.exports

let lambda
/**
 * Returns the Lambda client instance and if not present, creates a new one
 * @param { string } region
 * @param { string } profile
 */
const getLambdaInstance = e.getLambdaInstance = (region, profile) => {
  if (lambda) {
    return lambda
  } else {
    const awsConfig = { credentials: getAWSCredentials(profile), region }
    lambda = new AWS.Lambda(awsConfig)
    return lambda
  }
}

// Reusable inquirer lambda required inputs
e.templateQuestions = [
  { type: "input", name: "description", message: "description:" },
  { type: "input", name: "memorySize", message: "Lambda memory size:", validate: notNullValidator, default: "128" },
  { type: "input", name: "timeout", message: "Lambda timeout:", validate: notNullValidator, default: "3" },
  { type: "input", name: "runtime", message: "Lambda runtime:", validate: notNullValidator, default: "nodejs6.10" }
]

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
e.create = (functionName, region, description, handler, memorySize, timeout, runtime, roleArn, distBuffer, profile) => {
  const lambda = getLambdaInstance(region, profile)
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
