'use strict';
const path = require('path');
const requireDir = require('require-dir');
const request = require('request');
const l = require('./logger');
const pkg = require('./package.json');
const argv = require('simple-argv');

const nodeVersion = process.version;
if (nodeVersion[1] < 8) {
  l.frame(`node ${nodeVersion} found; aws-valkyrie-cli requires at least node 8; update your node version`);
  process.exit();
}

if ((argv.version || argv.v) && !argv._.length) {
  l.log(`${pkg.name} ${pkg.version}`);
  l.wait('checking for updates');
  request('https://registry.npmjs.org/aws-valkyrie-cli/latest', (err, res, body) => {
    if (body) {
      const latestVersion = JSON.parse(body).version;
      if (latestVersion !== pkg.version) l.frame(`new version available: ${l.colors.yellow}${latestVersion}${l.colors.reset}`);
      else l.log('you are currently using the latest version;');
    }
  });
} else {
  const commands = requireDir(path.join(__dirname, 'commands'));
  const command = commands[argv._[0]];
  if (argv.help) commands['help'].fn({l, commands: command ? {[argv._[0]]: command} : commands}).catch((...errors) => errors.forEach(l.error));
  else if (command) command.fn({l, commands}).catch((...errors) => errors.forEach(l.error));
  else l.log(`command not found, run ${l.colors.cyan}valk help${l.colors.reset} to list all commands;`);
}
