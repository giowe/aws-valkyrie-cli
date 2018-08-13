const { getDefaultProfile } = require("../utils.js")

module.exports = {
  flags: {
    profile: {
      name: "profile",
      description: `Uses a specific profile instead of the default one (set to "${getDefaultProfile()}");`
    }
  },
  templatesPrefix: "valkyrie-scaffolder-"
}
