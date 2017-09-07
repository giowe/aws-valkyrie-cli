'use strict';

module.exports = {
  description: 'Gets all commands info',
  fn: ({ l, commands }) => {
    l.log([
      'Help:',
      ...Object.entries(commands).map(([command, { flags = [], description }]) => [
        `${l.colors.white}${l.leftPad(command, 15)}${l.colors.reset}${description}`,
        ...flags.map(({ name, short, description }) => `${l.leftPad('', 17)}${l.leftPad(`--${name}${short? ` -${short}`:''}`, 12)} ${description}`)
      ].join('\n'))
    ].join('\n'));
  }
};
