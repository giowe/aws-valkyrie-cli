'use strict';

module.exports = {
  description: 'Shows all commands info',
  fn: ({ l, commands }) => new Promise((resolve) => {
    l.log('Help:', [
      ...Object.entries(commands).map(([command, { flags = [], description }]) => [
        `${l.colors.white}${l.leftPad(command, 15)}${l.colors.reset}${description}`,
        ...flags.map(({ name, short, description }) => `${l.leftPad('', 17)}${l.leftPad(`--${name}${short? ` -${short}`:''}`, 16)} ${description}`)
      ].join('\n'))
    ].join('\n\n'));
    resolve();
  })
};
