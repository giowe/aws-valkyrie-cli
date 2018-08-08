const {logger: l} = require('aws-valkyrie-utils');
const inquirer = require('inquirer');
const argv = require('simple-argv');
const {getProjectInfo, getAWSCredentials, getRequiredEnv, breakChain, getEnvColor, generateRetryFn, createDistZip} = require('../utils');
const AWS = require('aws-sdk');

// TODO, to review
let valkconfig;
try {
  valkconfig = getProjectInfo().valkconfig;
} catch(e) {}

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
    ...(valkconfig ? Object.keys(getProjectInfo().valkconfig.Environments).map(env => {
      return {
        name: env,
        description: `Updates ${env} Lambda;`
      };
    }) : []),
    {
      name: 'yes',
      short: 'y',
      description: 'Doesn\'t ask for confirm;'
    },
    {
      name: 'profile',
      description: 'Uses a specific profile instead of the default one;'
    }
  ],
  fn: () => new Promise((resolve, reject) => {
    const {valkconfig, root} = getProjectInfo();

    const vars = {};
    Promise.resolve()
      .then(() => {
        let selectedEnv;
        if (Object.keys(valkconfig.Environments).some(env => {
          if (argv[env]) {
            selectedEnv = env;
            return true
          } else {
            return false
          }
        })) {
          return {env: selectedEnv};
        } else {
          return getRequiredEnv(valkconfig);
        }
      })
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
        if (valkconfig.Environments[vars.env].Confirm && !argv.y) return inquirer.prompt([{
          type: 'confirm', name: 'confirm', message: `you are about to update Lambda ${vars.update.join(' and ')} in ${l.colors[getEnvColor(valkconfig, vars.env)]}${vars.env}${l.colors.reset}. Continue?`, default: false
        }]);
        return {confirm: true};
      })
      .then(({confirm}) => { if (!confirm) breakChain(); })
      .then(() => {
        const promises = [];
        const lambda = new AWS.Lambda(Object.assign({region: valkconfig.Project.Region}, {credentials: getAWSCredentials(argv.profile)}));
        const envColor = vars.envColor = l.colors[getEnvColor(valkconfig, vars.env)];
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
