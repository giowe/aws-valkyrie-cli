const {logger: l} = require('aws-valkyrie-utils');
module.exports = {
  description: 'Shows all commands info;',
  fn: ({commands}) => new Promise((resolve) => {
    l.log('Help:');
    l.log([
      ...Object.entries(commands).filter(([, {hidden}]) => !hidden).map(([command, {flags = [], description}]) => [
        `${l.colors.yellow} ${`${command}: `.padStart(10)} ${l.colors.reset}${description}`,
        ...flags.map(({name, short, description}) => `${''.padStart(17)}${`--${name}${short? ` -${short}`:''}`} ${description}`)
      ].join('\n'))
    ].join('\n\n'), {prefix: false});
    resolve();
  })
};
