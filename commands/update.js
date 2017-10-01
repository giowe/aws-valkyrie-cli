'use strict';
const { promisify } = require('util');
const zipdir = promisify(require('zip-dir'));
const inquirer = require('inquirer');
const { getProjectInfo, getAWSCredentials, breakChain } = require('../utils');

const AWS = require('aws-sdk');

module.exports = {
  description: 'Updates ',
  flags: [
    {
      name: 'staging',
      description: 'Updates staging Lambda;'
    },
    {
      name: 'production',
      description: 'Updates production Lambda;'
    },
    {
      name: 'code',
      description: 'Updates just the code part;'
    },
    {
      name: 'config',
      description: 'Updates just the configuration;'
    }
  ],
  fn: ({ l, argv }) => new Promise((resolve, reject) => {
    const { valkconfig, root } = getProjectInfo();

    const vars = {};
    Promise.resolve()
      .then(() => {
        const availableEnv = Object.keys(valkconfig.Environments);
        if (availableEnv.length === 0) throw new Error('no environment found in valkconfig.json');
        else if (availableEnv.length > 1) {
          if (argv.staging) return { env: 'staging' };
          else if (argv.production) return { env: 'production' };
          return inquirer.prompt([
            { type: 'list', name: 'env', message: 'select which environment you want to update:', choices: ['staging', 'production'], default: 0 }
          ]);
        } else return availableEnv[0].toLowerCase();
      })
      .then(answers => Object.assign(vars, answers))
      .then(() => {
        if (!argv.code && !argv.config) {
          return inquirer.prompt([
            { type: 'checkbox', name: 'update', message: 'what do you want to update?:', choices: [{ name: 'code', checked: true }, { name: 'config', checked: false }], validate: (choices) => choices.length ? true : 'select at least one;' }
          ]);
        } else return { update: ['code', 'config'].filter(e => argv[e]) };
      })
      .then(answers => Object.assign(vars, answers))
      .then(() => {
        if (vars.env === 'production') return inquirer.prompt([{
          type: 'confirm', name: 'confirm', message: `you are about to update Lambda ${vars.update.join(' and ')} in ${l.colors.magenta}production${l.colors.white}. Continue?`, default: false
        }]);
        return { confirm: true };
      })
      .then(({ confirm }) => { if (!confirm) breakChain(); })
      .then(() => {
        const promises = [];
        const lambda = new AWS.Lambda(Object.assign({ region: valkconfig.Project.Region }, { credentials: getAWSCredentials() }));
        const envColor = vars.envColor = l.colors[vars.env === 'staging' ? 'cyan' : 'magenta'];
        const { env, update } = vars;

        l.wait(`updating ${envColor}${env}${l.colors.reset} Lambda ${update.join(' and ')}...`);
        if (update.includes('code')) promises.push(new Promise((resolve, reject) => {
          zipdir(root)
            .then(ZipFile => lambda.updateFunctionCode({ FunctionName: valkconfig.Environments[env].Lambda.FunctionName, ZipFile }).promise())
            .then(resolve)
            .catch(reject);
        }));

        if (update.includes('config')) promises.push(lambda.updateFunctionConfiguration(valkconfig.Environments[env].Lambda).promise());
        return Promise.all(promises);
      })
      .then(([data]) => {
        const { env, update, envColor } = vars;
        l.success(`${envColor}${env}${l.colors.reset} Lambda ${update.join(' and ')} updated${update.includes('config') ? `:\n${JSON.stringify(data, null, 2)}` : ''}`);
      })
      .then(resolve)
      .catch(err => {
        if (err.chainBraker) resolve();
        else reject(err);
      });
  })
};
