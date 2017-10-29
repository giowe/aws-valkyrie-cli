'use strict';
const path = require('path');
const express = require('express');
const argv = require('simple-argv');
const {getProjectInfo} = require('../utils');

module.exports = {
  description: 'Test locally your Valkyrie application;',
  flags: [{
    name: 'env',
    short: 'e',
    description: 'Set the environment;'
  }, {
    name: 'port',
    short: 'p',
    description: 'Set the local port, default to 8000;'
  }],
  fn: ({l}) => new Promise((resolve, reject) => {
    const {root, valkconfig} = getProjectInfo();
    const [fileName, handler] = valkconfig.Environments.staging.Lambda.Handler.split('.');
    const valkHandler = require(path.join(root, fileName))[handler];

    const app = new express();
    app.all('*', (req, res) => {
      valkHandler(apiGatewayReq, context)
      res.json({});
    });

    const port = argv.port || argv.p || 8000;
    app.listen(port, () => l.success(`Valkyire local application is listening on port ${port}`));
  })
};

const apiGatewayReq = {
  resource: '/{proxy+}',
  path: '/req',
  httpMethod: 'get',
  headers: {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'accept-encoding': 'gzip, deflate, sdch, br',
    'accept-language': 'it-IT,en-US;q=0.8,it;q=0.6,en;q=0.4',
    'cloudfront-forwarded-proto': 'https',
    'cloudfront-is-desktop-viewer': 'true',
    'cloudfront-is-mobile-viewer': 'false',
    'cloudfront-is-smarttv-viewer': 'false',
    'cloudfront-is-tablet-viewer': 'false',
    'cloudfront-viewer-country': 'IT',
    host: '1wvucwclti.execute-api.eu-west-1.amazonaws.com',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.71 Safari/537.36',
    via: '2.0 9d2451a8646a37930fc6a6185abdc8f0.cloudfront.net (CloudFront)',
    'x-amz-cf-id': 'aeIGLDifZM6bNMEWVNIlDAZlEIYUTPR98dxXZMelIbgfoECY1rVGNQ==',
    'x-amzn-trace-id': 'Root=1-59f5e20b-1c97ea396ce7dfa853422df7',
    'x-forwarded-for': '93.37.214.20, 205.251.208.42',
    'x-forwarded-port': '443',
    'x-forwarded-proto': 'https'
  },
  queryStringParameters: null,
  pathParameters: {
    proxy: 'req'
  },
  stageVariables: null,
  requestContext: {
    path: '/staging/req',
    accountId: '477398036046',
    resourceId: '8vk9xb',
    stage: 'staging',
    requestId: '57eb854e-bcb3-11e7-97b4-fd91e7bdc8b9',
    identity: {
      cognitoIdentityPoolId: null,
      accountId: null,
      cognitoIdentityId: null,
      caller: null,
      apiKey: '',
      sourceIp: '93.37.214.20',
      accessKey: null,
      cognitoAuthenticationType: null,
      cognitoAuthenticationProvider: null,
      userArn: null,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.71 Safari/537.36',
      user: null
    },
    resourcePath: '/{proxy+}',
    httpMethod: 'GET',
    apiId: '1wvucwclti'
  },
  isBase64Encoded: false,
  method: 'get',
  query: null,
  params: { }
};
