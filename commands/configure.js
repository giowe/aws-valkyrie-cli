'use strict';

const inquirer = require('inquirer');
const { getGlobalConfig, saveGlobalConfig } = require('../utils');

module.exports = {
  description: 'Configure your aws credentials',
  flags: [{
    name: 'edit',
    short: 'e',
    description: 'Edit global .valkconfig file with you default editor;'
  }],
  fn: ({ argv }) => new Promise((resolve, reject) => {
    const config = getGlobalConfig();

    if (argv.edit || argv.e) {
      inquirer.prompt([{ type: 'editor', name: 'config', message: '.valkconfig', default: JSON.stringify(config, null, 2) }])
        .then(({ config }) => {
          saveGlobalConfig(config);
        })
        .then(resolve)
        .catch(reject);
    } else {
      const obfuscate = (str) => typeof str === 'string' ? str.split('').map((char, i) => i < str.length - 4 ? '*' : char).join('') : '';
      inquirer.prompt([
        { type: 'input', name: 'accessKeyId', message: `AWS Access Key ID [${obfuscate(config.accessKeyId)}]:` },
        { type: 'input', name: 'secretAccessKey', message: `AWS Secret Access Key [${obfuscate(config.secretAccessKey)}]:` }
      ])
        .then(({ accessKeyId, secretAccessKey }) => {
          if (accessKeyId) config.accessKeyId = accessKeyId;
          if (secretAccessKey) config.secretAccessKey = secretAccessKey;

          saveGlobalConfig(config);
        })
        .then(resolve)
        .catch(reject);
    }
  })
};
