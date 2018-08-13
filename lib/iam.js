const AWS = require("aws-sdk")
const { getAWSCredentials, generateRetryFn } = require("../utils.js")

const e = module.exports = { role: {}, policy: {} }

let iam
/**
 * Returns the IAM client instance and if not present, creates a new one
 * @param { string } profile
 */
const getIamInstance = e.getIamInstance = profile => {
  if (iam) {
    return iam
  } else {
    const awsCredentials = { credentials: getAWSCredentials(profile) }
    iam = new AWS.IAM(awsCredentials)
    return iam
  }
}

// A basic assume role policy
e.role.basicAssumeRolePolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: {
        Service: "lambda.amazonaws.com"
      },
      Action: "sts:AssumeRole"
    }
  ]
}

/**
 * Creates a new IAM role
 * @param { string } roleName
 * @param { string } description
 * @param { string } assumeRolePolicy
 * @param { string } path
 * @param { string } profile
 */
e.role.create = (roleName, description, assumeRolePolicy, path, profile) => {
  const iam = getIamInstance(profile)
  return generateRetryFn(() => {
    return iam.createRole({
      AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
      RoleName: roleName,
      Description: description,
      Path: path
    }).promise()
  })()
}

// A basic lambda IAM Policy
e.policy.basicLambdaPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      Resource: "arn:aws:logs:*:*:*"
    }
  ]
}

/**
 * Creates a new IAM policy
 * @param { string } policyName
 * @param { string } description
 * @param { string } policyDocument
 * @param { string } path
 * @param { string } profile
 */
e.policy.create = (policyName, description, policyDocument, path, profile) => {
  const iam = getIamInstance(profile)
  return generateRetryFn(() => {
    return iam.createPolicy({
      PolicyName: policyName,
      PolicyDocument: JSON.stringify(policyDocument),
      Description: description,
      Path: path
    }).promise()
  })()
}

/**
 * Attach the specified policy to the specified role
 * @param { string } policyArn
 * @param { string } roleName
 * @param { string } profile
 * @return {*}
 */
e.policy.attachRolePolicy = (policyArn, roleName, profile) => {
  const iam = getIamInstance(profile)
  return generateRetryFn(() => iam.attachRolePolicy({
    PolicyArn: policyArn,
    RoleName: roleName
  }).promise())()
}
