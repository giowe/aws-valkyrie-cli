'use strict';

const { getProjectInfo, getAWSCredentials, listFiles, subPath } = require('../utils');
//const CwLogs = require('aws-cwlogs');

module.exports = {
  description: 'Show real-time Valkyrie application logs',
  flags: [{
    name: 'stream',
    short: 's',
    description: 'Specify a CloudWatch Logs stream, latest by default;'
  }],
  fn: ({ argv }) => new Promise(() => {
    /*const { valkconfig } = getProjectInfo();

    new CwLogs({
      region: valkconfig.Project.Region,
      logGroupName: `/aws/lambda/${valkconfig.Lambda.FunctionName}`,
      streamname: argv.stream || argv.s,
      momentTimeFormat: 'hh:mm:ss:SSS',
      logFormat: 'lambda'
    }).start();*/
  })
};
