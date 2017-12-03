const {logger: l} = require('aws-valkyrie-utils');
const inquirer = require('inquirer');
const fs = require('fs');
const argv = require('simple-argv');
const {saveGlobalConfig, getGlobalConfigPath, getGlobalFullConfig} = require('../utils');

module.exports = {
  description: 'Configures AWS credentials;',
  flags: [
    {
      name: 'profile',
      description: 'Sets a specific profile instead of the default one;'
    },
    {
      name: 'default',
      description: 'Sets the default profile;'
    },
    {
      name: 'profiles',
      description: 'Lists all profiles;'
    },
    {
      name: 'purge',
      description: 'Deletes .valkconfig file from the home directory;'
    }
  ],
  fn: () => new Promise((resolve, reject) => {
    if (argv.purge) {
      try {
        fs.unlinkSync(getGlobalConfigPath());
        l.success('.valkconfig deleted;');
      } catch (err) {
        l.fail('no .valkconfig file found in the home directory');
      }
      return;
    }

    if (argv.default) {
      const fullConfig = getGlobalFullConfig();
      if (fullConfig.profiles[argv.default]) {
        fullConfig.defaultProfile = argv.default;
        saveGlobalConfig(fullConfig);
        l.success(`default profile is now ${l.colors.cyan}${fullConfig.defaultProfile}${l.colors.reset}`);
      } else {
        l.fail(`no ${l.colors.cyan}${argv.default}${l.colors.reset} profile found`);
      }
      return;
    }

    if (argv.profiles) {
      const fullConfig = getGlobalFullConfig();
      const profiles = Object.keys(fullConfig.profiles);
      if (!profiles.length) {
        l.log(`there are no profiles, run ${l.colors.cyan}aws configure${l.colors.reset}`);
      } else {
        l.log(`profiles:\n${profiles.map(profile => fullConfig.defaultProfile === profile ? `- ${profile} (default)` : `- ${profile}`).join('\n')}`);
      }
      return;
    }

    const fullConfig = getGlobalFullConfig();
    if (!fullConfig.defaultProfile) {
      fullConfig.defaultProfile = argv.profile || 'default';
    }

    let config = fullConfig.profiles[argv.profile || fullConfig.defaultProfile];
    if (!config) {
      config = fullConfig.profiles[argv.profile || fullConfig.defaultProfile] = {};
    }

    const obfuscate = (str) => typeof str === 'string' ? str.split('').map((char, i) => i < str.length - 4 ? '*' : char).join('') : '';
    return inquirer.prompt([
      {type: 'input', name: 'accessKeyId', message: `AWS Access Key ID [${obfuscate(config.accessKeyId)}]:`},
      {type: 'input', name: 'secretAccessKey', message: `AWS Secret Access Key [${obfuscate(config.secretAccessKey)}]:`}
    ])
      .then(({accessKeyId, secretAccessKey}) => {
        if (accessKeyId) config.accessKeyId = accessKeyId;
        if (secretAccessKey) config.secretAccessKey = secretAccessKey;

        saveGlobalConfig(fullConfig);
      })
      .then(resolve)
      .catch(reject);

  })
};
