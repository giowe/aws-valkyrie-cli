const { logger: l } = require("aws-valkyrie-utils")
const fs = require("fs")
const { getProjectInfo, createDistZip } = require("../utils")

module.exports = {
  hidden: true,
  description: "debug command;",
  fn: () => {
    const { root } = getProjectInfo()

    return createDistZip(root)
      .then(buffer => fs.writeFileSync("./debug.zip", buffer))
  }
}
