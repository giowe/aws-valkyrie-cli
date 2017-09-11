'use strict';

module.exports = {
  description: 'Updates ',
  flags: [
    {
      name: 'code',
      short: 'c',
      description: 'Updates just the AWS Lambda code part;'
    },
    {
      name: 'settings',
      short: 's',
      description: 'Updates just the AWS Lambda configuration part;'
    }
  ],
  fn: ({ l, commands, args }) => new Promise((resolve, reject) => {

  })
};
