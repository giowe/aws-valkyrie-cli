'use strict';
const inquirer = require('inquirer');
const AWS = require('aws-sdk');
module.exports = {
  description: 'Create a new Valkyrie application',
  fn: ({ l, commands, args }) => {
    const notNullValidator = (val) => val !== '';
    inquirer.prompt([
      { type: 'input', name: 'name', message: 'Project name:', validate: notNullValidator },
      { type: 'input', name: 'region', message: 'Region name:', validate: notNullValidator }
    ])
      .then(results => {
        const apigateway = new AWS.APIGateway({ region: results.region });
        apigateway.createRestApi({
          name: results.name,
          description: 'Valkyrie application'
        }, (err, data) => {
          if (err) return l.error(err);
          l.success(data);
        });
      })
      .catch(l.error);
  }
};
