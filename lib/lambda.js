const {notNullValidator} = require('../utils');

const e = module.exports;

e.templateQuestions = [
  {type: 'input', name: 'description', message: 'description:'},
  {type: 'input', name: 'memorySize', message: 'Lambda memory size:', validate: notNullValidator, default: '128'},
  {type: 'input', name: 'timeout', message: 'Lambda timeout:', validate: notNullValidator, default: '3'},
  {type: 'input', name: 'runtime', message: 'Lambda runtime:', validate: notNullValidator, default: 'nodejs6.10'}
];
