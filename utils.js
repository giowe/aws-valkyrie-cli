'use strict';
const fs = require('fs');
const path = require('path');
const e = module.exports = {};

e.listFiles = (rootPath, onFile, onFolder) => new Promise((resolve) => {
  fs.readdirSync(rootPath).forEach(filePath => {
    const joinedPath = path.join(rootPath, filePath);
    const fileStat = fs.lstatSync(joinedPath);
    if (fileStat.isFile() && onFile) onFile(joinedPath, fs.readFileSync(joinedPath).toString());
    else if (fileStat.isDirectory()) {
      if (onFolder) onFolder(joinedPath);
      return e.listFiles(joinedPath, onFile, onFolder);
    }
  });
  resolve();
});

e.subPath = (fullPath, fromString) => fullPath.substr(fullPath.indexOf(fromString) + 1 + fromString.length, fullPath.length);
