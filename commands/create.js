const inquirer = require('inquirer');
const {logger: l} = require('aws-valkyrie-utils');
const AWS = require('aws-sdk');
const CloudFormation = new AWS.CloudFormation();
const del = require('del');
const {promisify} = require('util');
const validate = require('validate-npm-package-name');
const exec = promisify(require('child_process').exec);
const path = require('path');
const fs = require('fs');
const argv = require('simple-argv');
const urlJoin = require('url-join');
const cfScaffolder = require('valkyrie-cftemplate-scaffolder-default');
const {getAWSCredentials, listFiles, subPath, generateRetryFn, getEnvColor, getApiUrl, createDistZip} = require('../utils');
const cwd = process.cwd();

module.exports = {
  description: 'Creates a new Valkyrie application;',
  flags: [
    {
      name: 'profile',
      description: 'Uses a specific profile instead of the default one;'
    }
  ],
  fn: ({commands}) => new Promise((resolve, reject) => {
    const vars = {};
    const valkconfig = {
      Project: {},
      Environments: {}
    };
    const awsCredentials = {credentials: getAWSCredentials(argv.profile)};
    const codeTemplatePrefix = 'valkyrie-scaffolder-';
    const cfTemplatePrefix = 'valkyrie-cftemplate-scaffolder-';
    const saveValkconfig = () => fs.writeFileSync(path.join(vars.projectFolder, 'valkconfig.json'), JSON.stringify(valkconfig, null, 2));

    //SCAFFOLDER SELECTION
    exec('npm root -g')
      .then(({stdout}) => {
        vars.npmGlobalPath = stdout.replace('\n', '');
        const scaffolders = vars.scaffolders = fs.readdirSync(vars.npmGlobalPath).reduce((acc, module)=> {
          [[codeTemplatePrefix, 'code'], [cfTemplatePrefix, 'cf']].forEach(([prefix, type]) => {
            if (prefix === module.substr(0, prefix.length)) {
              const templatePath = path.join(vars.npmGlobalPath, module);
              const templateListName = `${module.substr(prefix.length, module.length)} (${require(path.join(templatePath, 'package.json')).version})`;
              acc[type][templateListName] = {
                name: module,
                path: templatePath
              };
            }
          });

          return acc;
        }, {
          code: {
            [`default (${require(`${codeTemplatePrefix}default/package.json`).version})`]: {
              name: `${codeTemplatePrefix}default`,
              path: `${codeTemplatePrefix}default`
            }
          },
          cf: {
            [`default (${require(`${cfTemplatePrefix}default/package.json`).version})`]: {
              name: `${cfTemplatePrefix}default`,
              path: `${cfTemplatePrefix}default`
            }
          }
        });

        return inquirer.prompt([
          {type: 'list', name: 'codeScaffolder', message: 'select a code template to scaffold your project:', choices: Object.keys(scaffolders.code)},
          {type: 'list', name: 'cfScaffolder', message: 'select a cloud front template to scaffold your project:', choices: Object.keys(scaffolders.cf)}
        ]);
      })

      //TEMPLATE VARIABLES INPUT
      .then(({codeScaffolder, cfScaffolder}) => {
        const {path: codeScaffolderPath} = vars.scaffolders.code[codeScaffolder];
        const {path: cfScaffolderPath} = vars.scaffolders.cf[cfScaffolder];

        vars.codeScaffolderPath = codeScaffolderPath;
        vars.cfScaffolderPath = cfScaffolderPath;

        const notNullValidator = (val) => val === '' ? 'required field;' : true;
        const defaultInputs = [
          {type: 'input', name: 'projectName', message: 'project name:', default: argv._[1], validate: name => {
            const {validForNewPackages, warnings, errors} = validate(name);
            if (validForNewPackages) return true;
            const out = [];
            if (errors) out.push(...errors);
            if (warnings) out.push(...warnings);
            return `${out.join(', ')};`;
          }},
          {type: 'checkbox', name: 'environments', message: 'select which environment you want to generate:', choices: [{name: 'staging', checked: true}, {name: 'production', checked: true}], validate: (choices) => choices.length ? true : 'select at least one environment;'},
          {type: 'input', name: 'description', message: 'description:'},
          {type: 'input', name: 'region', message: 'project region:', validate: notNullValidator},
        ];
        const {inputs: codeScaffolderInputs, source, handler, root} = require(codeScaffolderPath);
        vars.codeScaffolderSourcePath = path.join(codeScaffolderPath, source);
        vars.handler = handler;
        vars.root = root;

        vars.cfScaffolder = cfScaffolder = require(cfScaffolderPath);

        const cfScaffolderInputs = cfScaffolder.templates.reduce((inputs, {name, required, message, sources, dependsOn}) => {
          if(!required) {
            inputs.push({
              type: 'confirm',
              name: `parameters.${name}.enabled`,
              message,
              default: false,
              when: answers => dependsOn ? answers['parameters'][dependsOn] && answers['parameters'][dependsOn].enabled : true
            });
          }

          if(Array.isArray(sources) && sources.length > 1) {
            inputs.push({
              type: 'list',
              name: `parameters.${name}.source`,
              choices: sources.map(({template, choice}) => ({ name: choice, value: template })),
              message: 'chose a template:',
              when: answers => required || answers['parameters'][name] && answers['parameters'][name].enabled
            });
          }

          if(Array.isArray(sources)) {
            sources.forEach(({inputs: templateInputs, choice}) => templateInputs.forEach(({type, name: inputName, message, choices, default: defaultValue}) => {
              inputs.push({
                type,
                name: `parameters.${name}.inputs.${inputName}`,
                message,
                choices,
                default: defaultValue,
                when: answers => sources.length <= 1 || answers['parameters'][name] && answers['parameters'][name].source === choice
              });
            }));
          }

          return inputs;
        }, []);

        const removeRedundantInputs = ({name}) => {
          for (let i = 0; i < l; i++) if (defaultInputs[i].name === name) return false;
          return true;
        };

        const l = defaultInputs.length;
        return inquirer.prompt([
          ...defaultInputs,
          ...codeScaffolderInputs.filter(removeRedundantInputs),
          ...cfScaffolderInputs.filter(removeRedundantInputs)
        ]);
      })

      .then(answers => {
        vars.template = answers;
        vars.cfScaffolder.templates.filter(({required}) => required).forEach(({name}) => {
          if (!answers[name]) answers[name] = {};
          answers[name].enabled = true;
        });
        vars.projectFolder = path.join(cwd, vars.template.projectName);
        vars.plural = answers.environments.length > 1;
        valkconfig.Environments = {};
        valkconfig.Project.Parameters = answers.parameters;
        valkconfig.Project.Region = answers.region;
        fs.mkdirSync(vars.projectFolder);
      })

      //TEMPLATING AND SCAFFOLDING APPLICATION
      .then(() => {
        return listFiles(vars.codeScaffolderSourcePath,
          (filePath, content) => {
            let fileName = filePath.replace(vars.codeScaffolderSourcePath, '');
            fileName = fileName.replace('npmignore', 'gitignore');
            Object.entries(vars.template).forEach(([key, value]) => {
              const re = new RegExp(`{{${key}}}`, 'g');
              content = content.replace(re, value);
            });
            fs.writeFileSync(path.join(vars.projectFolder, fileName), content);
          },
          dirPath => fs.mkdirSync(path.join(path.join(cwd, subPath(dirPath, vars.templateName))))
        );
      })
      .then(() => l.success(`project scaffolded in ${vars.projectFolder}`))
      //INSTALLING PACKAGES
      .then(() => {
        l.wait('installing npm packages');
        return exec(`npm install --prefix ${vars.projectFolder}`);
      })
      .then(() => {
        l.success('project packages installed;');
        return del(path.join(vars.projectFolder, 'etc'), {force: true});
      })
      .then(() => {
        l.wait('Creating the infrastracture');
        console.log(JSON.stringify(valkconfig));
        return vars.cfScaffolder.create(CloudFormation, valkconfig);
      })
      .then(() => l.success('Infrastructure is up!'))
      .then(() => {
        saveValkconfig();
        l.success(`valkconfig.json:\n${JSON.stringify(valkconfig, null, 2)}`);
        l.success(`Valkyrie ${vars.template.projectName} project successfully created; the application is available at the following link${vars.template.environments.length > 1 ? 's' : ''}:`);
        Promise.all(vars.template.environments.map(env => l.log(`- ${env.toLowerCase()}: ${l.colors[getEnvColor(env)]}${urlJoin(getApiUrl(valkconfig, env), vars.root)}${l.colors.reset}`, {prefix: false})));
        resolve();
      })
      .catch(err => {
        l.fail('creation process failed;');
        l.error(err);
        if (!argv['no-revert']) {
          l.log('reverting modifications...');
          return commands.delete.fn({argv, commands}, valkconfig);
        }
      })
      .then(resolve)
      .catch(reject);
  })
};
