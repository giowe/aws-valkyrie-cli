'use strict';
const inquirer = require('inquirer');
const path = require('path');
const { listFiles, subPath, matchAll } = require('../utils');
const fs = require('fs');
const cwd = process.cwd();
/*exec('npm root -g')
  .then(({ stdout }) => {

  });
*/

module.exports = {
  description: 'Create a new Valkyrie application',
  fn: ({ l, commands, args }) => new Promise((resolve, reject) => {
    const g = {};
    const notNullValidator = (val) => val !== '';
    inquirer.prompt([
      { type: 'input', name: 'projectName', message: 'project name:', validate: notNullValidator, default: 'test' },
      { type: 'input', name: 'region', message: 'region:', validate: notNullValidator, default: 'eu-west-1' }
      /*{ type: 'input', name: 'projectDescription', message: 'Description:'},
      { type: 'input', name: 'author', message: 'Author:'},
      { type: 'input', name: 'license', message: 'License:'},*/
    ])
      .then(answers => Object.assign(g, answers))
      .then(() => {
        g.templateName = 'valkyrie-scaffolder-default';
        g.templatePath = path.join(__dirname, '..', 'node_modules', g.templateName);
      })
      .then(() => listFiles(g.templatePath, (filePath, content) => {

        const re = new RegExp(/{{(.*?)}}/g);
        const variables = content.match(re);
        if (variables) variables.forEach(variable => {
          const cleanVariable = variable.substr(2, variable.length - 4);

        });
      }))
      .then(() => {
        return listFiles(g.templatePath,
          (filePath, content) => {

            console.log(subPath(filePath, g.templateName));
          },
          dirPath => fs.mkdirSync(path.join(path.join(cwd, subPath(dirPath, g.templateName))))
        );
      })
      .then(resolve)
      .catch(err => {
        l.error(err);
        reject(err);
      });
  })
};
