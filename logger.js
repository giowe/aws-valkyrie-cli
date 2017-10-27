/* eslint-disable no-console */
'use strict';
const argv = require('simple-argv');
const {Spinner} = require('cli-spinner');

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
  stopSpinner();
  const options = {prefix: true, inline: false};
  if (typeof args[args.length -1] === 'object') Object.assign(options, args.pop());
  args.unshift(color);
  if (options.prefix) args.unshift(prefix);

  if (!options.inline) console.log(...args, colors.reset);
  else process.stdout.write(`${args.map(arg => {
    switch (typeof arg) {
      case 'string': return arg;
      case 'object': return JSON.stringify(arg, null, 2);
      default: return '' + arg;
    }
  }).join(' ')}${colors.reset}`);
}

function frame(text, options = {prefix: true}) {
  stopSpinner();
  const border = repeat('─', text.replace(/\u001b\[.*?m/g, '').length + 2);
  const padding = options.prefix ? repeat(' ', 7) : '';
  console.log([
    `${padding}┌${border}┐`,
    `${options.prefix ? `${prefix} ` : '' }│ ${text} │`,
    `${padding}└${border}┘`
  ].join('\n'));
}

function fail(...args) {
  log(`[${colors.red}FAILURE${colors.reset}]`, ...args);
}

function error(err) {
  log(`[${colors.red}ERROR${colors.reset}]`, argv.debug ? `\n${err.stack}` : err.message);
}

function warning(err) {
  log(`[${colors.yellow}WARNING${colors.reset}]`, argv.debug ? `\n${err.stack}` : err.message);
}

function success(...args) {
  log(`[${colors.green}SUCCESS${colors.reset}]`, ...args);
}

function debug(...args) {
  if (argv.debug) log(`[${colors.magenta}DEBUG${colors.reset}]`, ...args);
}

const spinner = new Spinner();
spinner.setSpinnerString('⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏');
function wait(...args) {
  stopSpinner();
  const options = {prefix: true};
  if (typeof args[args.length -1] === 'object') Object.assign(options, args.pop());
  spinner.text = `${options.prefix ? `${prefix} `: ''}[${colors.white}WAIT${colors.reset}] ${args.join(' ')} %s`;
  spinner.start();
}

function stopSpinner() {
  if (spinner.isSpinning()) spinner.stop(true);
}

module.exports = {
  prefix,
  frame,
  repeat,
  leftPad,
  log,
  fail,
  error,
  warning,
  success,
  debug,
  wait,
  colors
};
