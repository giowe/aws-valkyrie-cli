'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const AWS = require('aws-sdk');
const argv = require('simple-argv');
const inquirer = require('inquirer');
const {promisify} = require('util');
const {spawn} = require('child_process');
const zipdir = promisify(require('zip-dir'));
const e = module.exports = {};

e.listFiles = (rootPath, onFile, onFolder) => new Promise((resolve) => {
  fs.readdirSync(rootPath).forEach(filePath => {
    const joinedPath = path.join(rootPath, filePath);
    const fileStat = fs.lstatSync(joinedPath);
    if (fileStat.isFile() && onFile) onFile(joinedPath, fs.readFileSync(joinedPath).toString());
    else if (fileStat.isDirectory()) {
      if (onFolder) onFolder(joinedPath);
      return e.listFiles(joinedPath, onFile, onFolder);
    }
  });
  resolve();
});

e.subPath = (fullPath, fromString) => fullPath.substr(fullPath.indexOf(fromString) + 1 + fromString.length, fullPath.length);

e.getProjectInfo = () => {
  const cwd = process.cwd().split('/');
  const l = cwd.length;
  for (let i = 0; i < l; i++) {
    try {
      const root = path.resolve('/', path.join(...cwd));
      return {
        root,
        valkconfig: require(path.join(root, 'valkconfig.json')),
        pkg: require(path.join(root, 'package.json'))
      };
    } catch(ignore) {
      cwd.pop();
    }
  }

  throw new Error('not a Valkyrie project (or any of the parent directories): missing valkconfig.json');
};

e.getGlobalConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.valkconfig')));
  } catch (ignore) {
    return {};
  }
};

e.saveGlobalConfig = (config) => {
  fs.writeFileSync(path.join(os.homedir(), '.valkconfig'), typeof config === 'string' ? config : JSON.stringify(config, null, 2));
};


e.getAWSCredentials = () => {
  const config = e.getGlobalConfig();
  if (config.secretAccessKey && config.accessKeyId) return new AWS.Credentials(config);
  return null;
};

e.breakChain = (data) => {
  const e = new Error(data);
  e.chainBraker = true;
  throw e;
};

e.joinUrl = (...args) => args.filter(e => e).map(e => e.replace('/', '')).join('/');


const wait = (time = 1000) => new Promise(resolve => setTimeout(resolve, time));
e.generateRetryFn = (promiseFnWrapper) => async function retryFn(maxRetries = 10) {
  try {
    return await promiseFnWrapper();
  } catch(err) {
    if (maxRetries > 0) {
      await wait();
      return await retryFn(maxRetries -1);
    }
    else throw err;
  }
};

e.getRequiredEnv = (valkconfig) => new Promise(resolve => {
  const availableEnv = Object.keys(valkconfig.Environments);
  if (availableEnv.length === 0) throw new Error('no environment found in valkconfig.json');
  else if (availableEnv.length > 1) {
    if (argv.staging) return resolve ({env: 'staging'});
    else if (argv.production) return resolve({env: 'production'});
    return resolve(inquirer.prompt([
      {type: 'list', name: 'env', message: 'select the environment:', choices: ['staging', 'production'], default: 0}
    ]));
  } else return resolve({env: availableEnv[0].toLowerCase()});
});

e.getEnvColor = (env) => env.toLowerCase() === 'staging' ? 'cyan' : 'magenta';

e.getApiUrl = (valkconfig, env) => `https://${valkconfig.Environments[env].Api.Id}.execute-api.${valkconfig.Project.Region}.amazonaws.com/${env.toLowerCase()}`;

e.createDistZip = (projectFolder) => new Promise((resolve, reject) => {
  let valkignore;
  try {
    valkignore = fs.readFileSync(path.join(projectFolder, '.valkignore')).toString().split('\n').filter(raw => raw);
  } catch(ignore) {}

  //const { dependencies } = require(path.join(projectFolder, 'package.json'));

  e.lsDependencies()
    .then(({dependencies}) => {
      const dig = (dep, modules = {}) => {
        Object.entries(dep).forEach(([ name, details ]) => {
          modules[name] = true;
          if (details.dependencies) dig(details.dependencies, modules);
        });
        return modules;
      };

      console.log(Object.keys(dig(dependencies)));
    })
    .then(resolve)
    .catch(reject);
});

e.lsDependencies = () => new Promise((resolve, reject) => {
  const ls = spawn('npm', ['ls', '--production', '--json']);
  let out = '';
  ls.stdout.on('data', data => out += data);
  let err = '';
  ls.stderr.on('data', (data) => err += data);
  ls.on('close', () => err ? reject(err) : resolve(JSON.parse(out)));
});
