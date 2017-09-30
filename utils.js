'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const AWS = require('aws-sdk');
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
