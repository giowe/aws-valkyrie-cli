const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const {logger: l} = require('aws-valkyrie-utils');
const exec = promisify(require('child_process').exec);
const {templatesPrefix} = require('./const.json');

const e = module.exports;

const getScaffolderDetails = e.getScaffolderDetails = (availableScaffolders, scaffolder) => {
  const scaffolderPath = availableScaffolders[scaffolder].path;
  const {inputs: scaffolderInputs, source, handler, root} = require(scaffolderPath);
  return ({
    scaffolderInputs,
    scaffolderSourcePath: path.join(scaffolderPath, source),
    handler,
    root,
    scaffolder
  });
};

e.selectScaffolder = () => {
  const state = {};
  return exec('npm root -g')
    .then(({stdout}) => {
      const npmGlobalPath = stdout.replace('\n', '');
      state.scaffolders = {};
      const scaffoldersList = fs.readdirSync(npmGlobalPath).reduce((acc, module)=> {
        if (module.substr(0, templatesPrefix.length) === templatesPrefix) {
          const templatePath = path.join(npmGlobalPath, module);
          const templateListName = `${module.substr(templatesPrefix.length, module.length)} (${require(path.join(templatePath, 'package.json')).version})`;
          state.scaffolders[templateListName] = {
            name: module,
            path: templatePath
          };
          acc.push(templateListName);
        }
        return acc;
      }, []);

      if (!scaffoldersList.length) throw new Error(`no Valkyrie scaffolders found! Install globally at least the default Valkyrie scaffolder running command: ${l.colors.cyan}npm i -g valkyrie-scaffolder-default${l.colors.reset}`);
      return inquirer.prompt({type: 'list', name: 'scaffolder', message: 'select a template to scaffold your project:', choices: scaffoldersList});
    })
    .then(({scaffolder}) => getScaffolderDetails(state.scaffolders, scaffolder));
};
