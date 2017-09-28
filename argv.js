'use strict';

const argv = { _: [] };
const cleanFlag = (flag) => flag.substr(flag[1] === '-' ? 2 : 1);
process.argv.forEach((e, i) => {
  if (i <= 1) return;
  if (e[0] !== '-') {
    const prevE = process.argv[i-1];
    if (prevE[0] === '-') argv[cleanFlag(prevE)] = e;
    else argv._.push(e);
  }
  else argv[cleanFlag(e)] = true;
});

module.exports = argv;
