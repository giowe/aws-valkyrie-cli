'use strict';

const argv = require('yargs').argv;
const path = require('path');
const logger = require('./logger');
const requireDir = require('require-dir');
const pkg = require('./package.json');

//todo check for update

if ((argv.version || argv.v) && !argv._.length) {
  logger.log(pkg.name, pkg.version);
} else {
  const commands = requireDir(path.join(__dirname, 'commands'));
  const command = commands[argv._[0]];
  if (command) command.fn(logger, argv);
  else logger.log('Command not found');
}
