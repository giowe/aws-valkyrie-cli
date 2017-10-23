'use strict';

const fs = require('fs');
const {getProjectInfo, createDistZip} = require('../utils');

module.exports = {
  hidden: true,
  description: 'debug command;',
  fn: ({l}) => new Promise((resolve, reject) => {
    const {root} = getProjectInfo();

    createDistZip(root)
      .then(buffer => fs.writeFileSync('./prova.zip', buffer))
      .then(resolve)
      .catch(err => {
        reject(err);
      });
  })
};
