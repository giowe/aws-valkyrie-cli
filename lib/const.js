const { getDefaultProfile, notNullValidator } = require("../utils.js")

module.exports = {
  lambdaTemplateQuestions: [
    { type: "input", name: "description", message: "description:" },
    { type: "input", name: "memorySize", message: "Lambda memory size:", validate: notNullValidator, default: "128" },
    { type: "input", name: "timeout", message: "Lambda timeout:", validate: notNullValidator, default: "3" },
    { type: "input", name: "runtime", message: "Lambda runtime:", validate: notNullValidator, default: "nodejs8.10" }
  ],
  flags: {
    profile: {
      name: "profile",
      description: `Uses a specific profile instead of the default one (set to "${getDefaultProfile()}");`
    }
  },
  templatesPrefix: "valkyrie-scaffolder-"
}
