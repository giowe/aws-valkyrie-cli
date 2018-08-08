const e = module.exports;

e.createEnvRole = (iam, projectName, env) => {
  return iam.createRole({
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
    RoleName: `${projectName}-${env}-lambda`,
    Description: `Valkyrie "${projectName}" project ${env} role assumed by "${projectName}-${env}"`,
    Path: `/valkyrie/${env}/`
  }).promise();
}

e.createEnvPolicy = (iam, projectName, env, role) => {
  return iam.createPolicy({
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
    PolicyName: `${projectName}-${env}-lambda`,
    Description: `Valkyrie "${projectName}" project ${env} policy attached to "${role}"`,
    Path: `/valkyrie/${env}/`
  }).promise()
}
