/* eslint-disable no-console */
'use strict';

const { argv } = require('yargs');
const colors = {
  'reset': '\x1b[0m',
  'bright': '\x1b[1m',
  'dim': '\x1b[2m',
  'underscore': '\x1b[4m',
  'blink': '\x1b[5m',
  'reverse': '\x1b[7m',
  'hidden': '\x1b[8m',
  'black': '\x1b[30m',
  'red': '\x1b[31m',
  'green': '\x1b[32m',
  'yellow': '\x1b[33m',
  'blue': '\x1b[34m',
  'magenta': '\x1b[35m',
  'cyan': '\x1b[36m',
  'white': '\x1b[37m',
  'crimson': '\x1b[38m',
  'bg': {
    'black': '\x1b[40m',
    'red': '\x1b[41m',
    'green': '\x1b[42m',
    'yellow': '\x1b[43m',
    'blue': '\x1b[44m',
    'magenta': '\x1b[45m',
    'cyan': '\x1b[46m',
    'white': '\x1b[47m',
    'crimson': '\x1b[48m'
  }
};
const prefix = `[${colors.yellow}VALK${colors.reset}]`;

function leftPad(text, len, char = ' ', alignment = 'left') {
  text = text.toString();
  const l = len - text.length;
  for (let i = 0; i < l; i++) {
    if (alignment === 'left') text += char;
    else text = char + text;
  }
  return text;
}

function repeat(text, len) {
  let out = '';
  for (let i = 0; i < len; i++) out += text;
  return out;
}

function log(color, ...args) {
  console.log(prefix, color, ...args, colors.reset);
}

function frame(text) {
  const border = repeat('─', text.length + 2);
  const padding = repeat(' ', 7);
  log([
    `┌${border}┐`,
    `${padding}│ ${text} │`,
    `${padding}└${border}┘`
  ].join('\n'));
}

function fail(...args) {
  log(`[${colors.red}FAILURE${colors.reset}]`, ...args);
}

function error(err) {
  log(`[${colors.red}ERROR${colors.reset}]`, argv.debug ? `\n${err.stack}` : err.message);
}

function success(...args) {
  log(`[${colors.green}SUCCESS${colors.reset}]`, ...args);
}

module.exports = {
  frame,
  repeat,
  leftPad,
  log,
  fail,
  error,
  success,
  colors
};
