const inquirer = require('inquirer');
const argv = require('simple-argv');
const {getProjectInfo, getAWSCredentials, getRequiredEnv, breakChain, getEnvColor, generateRetryFn, createDistZip} = require('../utils');
const AWS = require('aws-sdk');

module.exports = {
  description: 'Updates you function code and/or configurations;',
  flags: [
    {
      name: 'code',
      description: 'Updates just the code part;'
    },
    {
      name: 'config',
      description: 'Updates just the configuration;'
    },
    {
      name: 'staging',
      description: 'Updates staging Lambda;'
    },
    {
      name: 'production',
      description: 'Updates production Lambda;'
    },
    {
      name: 'yes',
      short: 'y',
      description: 'Doesn\'t ask for confirm in production;'
    },
    {
      name: 'profile',
      description: 'Uses a specific profile instead of the default one;'
    }
  ],
  fn: ({l}) => new Promise((resolve, reject) => {
    const {valkconfig, root} = getProjectInfo();

    const vars = {};
    Promise.resolve()
      .then(() => getRequiredEnv(valkconfig))
      .then(answers => Object.assign(vars, answers))
      .then(() => {
        if (!argv.code && !argv.config) {
          return inquirer.prompt([
            {type: 'checkbox', name: 'update', message: 'what do you want to update?:', choices: [{name: 'code', checked: true}, {name: 'config', checked: false}], validate: (choices) => choices.length ? true : 'select at least one;'}
          ]);
        } else return {update: ['code', 'config'].filter(e => argv[e])};
      })
      .then(answers => Object.assign(vars, answers))
      .then(() => {
        if (vars.env === 'production' && !argv.y) return inquirer.prompt([{
          type: 'confirm', name: 'confirm', message: `you are about to update Lambda ${vars.update.join(' and ')} in ${l.colors[getEnvColor('production')]}production${l.colors.reset}. Continue?`, default: false
        }]);
        return {confirm: true};
      })
      .then(({confirm}) => { if (!confirm) breakChain(); })
      .then(() => {
        const promises = [];
        const lambda = new AWS.Lambda(Object.assign({region: valkconfig.Project.Region}, {credentials: getAWSCredentials()}));
        const envColor = vars.envColor = l.colors[getEnvColor(vars.env)];
        const {env, update} = vars;

        l.wait(`updating ${envColor}${env}${l.colors.reset} Lambda ${update.join(' and ')}...`);
        if (update.includes('code')) promises.push(new Promise((resolve, reject) => {
          //require('util').promisify(require('zip-dir'))(root)
          createDistZip(root)
            .then(ZipFile => generateRetryFn(() => lambda.updateFunctionCode({FunctionName: valkconfig.Environments[env].Lambda.FunctionName, ZipFile}).promise())())
            .then(resolve)
            .catch(reject);
        }));

        if (update.includes('config')) promises.push(generateRetryFn(() => lambda.updateFunctionConfiguration(valkconfig.Environments[env].Lambda).promise())());
        return Promise.all(promises);
      })
      .then(([data]) => {
        const {env, update, envColor} = vars;
        l.success(`${envColor}${env}${l.colors.reset} Lambda ${update.join(' and ')} updated${update.includes('config') ? `:\n${JSON.stringify(data, null, 2)}` : ''}`);
      })
      .then(resolve)
      .catch(err => {
        if (err.chainBraker) resolve();
        else reject(err);
      });
  })
};
