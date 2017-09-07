'use strict';

const path = require('path');
const argv = require('yargs').argv;
const requireDir = require('require-dir');
const request = require('request');
const l = require('./logger');
const pkg = require('./package.json');

//todo check for update

if ((argv.version || argv.v) && !argv._.length) {
  l.log(pkg.name, pkg.version);
} else {
  const commands = requireDir(path.join(__dirname, 'commands'));
  const command = commands[argv._[0]];
  if (command) command.fn({ l, argv, commands });
  else l.log('Command not found');
}
