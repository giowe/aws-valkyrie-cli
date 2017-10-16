'use strict';

const {promisify} = require('util');
const {getProjectInfo, createDistZip} = require('../utils');

module.exports = {
  hidden: true,
  description: 'debug command;',
  fn: ({l}) => new Promise((resolve, reject) => {
    const {valkconfig, root} = getProjectInfo();

    createDistZip(root)
      .then(resolve)
      .catch(reject);
  })
};
