const AWS = require("aws-sdk")
const { getAWSCredentials, generateRetryFn } = require("../utils.js")

const e = module.exports

let iam
const getIamInstance = profile => {
  if (iam) {
    return iam
  } else {
    const awsCredentials = { credentials: getAWSCredentials(profile) }
    iam = new AWS.IAM(awsCredentials)
    return iam
  }
}

const basicAssumeRolePolicy = {
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

const createRole = (roleName, description, assumeRolePolicy, path, profile) => {
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

e.role = { create: createRole, basicAssumeRolePolicy }

const basicLambdaPolicy = {
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

const createPolicy = (policyName, description, policyDocument, path, profile) => {
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

const attachRolePolicy = (policyArn, roleName, profile) => {
  const iam = getIamInstance(profile)
  return generateRetryFn(() => iam.attachRolePolicy({
    PolicyArn: policyArn,
    RoleName: roleName
  }).promise())()
}

e.policy = { create: createPolicy, basicLambdaPolicy, attachRolePolicy  }
