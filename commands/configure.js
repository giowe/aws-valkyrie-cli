const l = require("../logger.js")
const inquirer = require("inquirer")
const fs = require("fs")
const argv = require("simple-argv")
const { saveGlobalConfig, getGlobalConfigPath, getGlobalFullConfig, obfuscate } = require("../utils.js")
const { flags: { profile: profileFlag } } = require("../lib/const.js")

/** Removes the ~/.valconfig file */
const purge = () => {
  try {
    fs.unlinkSync(getGlobalConfigPath())
    l.success(".valkconfig deleted;")
  } catch (err) {
    l.fail("no .valkconfig file found in the home directory")
  }
}

/**
 * Verify that the specified profile exists in ~/.valkconfig and set it as the default one
 * @param {string} profile
 */
const setDefaultProfile = profile => {
  const fullConfig = getGlobalFullConfig()
  if (fullConfig.profiles[profile]) {
    fullConfig.defaultProfile = profile
    saveGlobalConfig(fullConfig)
    l.success(`default profile is now ${l.colors.cyan}${fullConfig.defaultProfile}${l.colors.reset}`)
  } else {
    l.fail(`no ${l.colors.cyan}${argv.default}${l.colors.reset} profile found`)
  }
}

/**
 * List ~/.valkconfig profiles
 */
const listProfiles = () => {
  const fullConfig = getGlobalFullConfig()
  const profiles = Object.keys(fullConfig.profiles)
  if (!profiles.length) {
    l.log(`there are no profiles, run ${l.colors.cyan}aws configure${l.colors.reset}`)
  } else {
    l.log(`profiles:\n${profiles.map(profile => fullConfig.defaultProfile === profile ? `- ${profile} (default)` : `- ${profile}`).join("\n")}`)
  }
}


module.exports = {
  description: "Configures and manages AWS credentials;",
  flags: [
    profileFlag,
    {
      name: "default",
      description: "Sets the default profile;"
    },
    {
      name: "profiles",
      description: "Lists all profiles;"
    },
    {
      name: "purge",
      description: "Deletes .valkconfig file from the home directory;"
    }
  ],
  fn: () => new Promise((resolve, reject) => {
    if (argv.purge) {
      return purge()
    }

    if (argv.default) {
      return setDefaultProfile(argv.default)
    }

    if (argv.profiles) {
      return listProfiles()
    }

    const fullConfig = getGlobalFullConfig()
    if (!fullConfig.defaultProfile) {
      fullConfig.defaultProfile = argv.profile || "default"
    }

    let config = fullConfig.profiles[argv.profile || fullConfig.defaultProfile]
    if (!config) {
      config = fullConfig.profiles[argv.profile || fullConfig.defaultProfile] = {}
    }

    return inquirer.prompt([
      { type: "input", name: "accessKeyId", message: `AWS Access Key ID [${obfuscate(config.accessKeyId)}]:` },
      { type: "input", name: "secretAccessKey", message: `AWS Secret Access Key [${obfuscate(config.secretAccessKey)}]:` }
    ])
      .then(({ accessKeyId, secretAccessKey }) => {
        if (accessKeyId) config.accessKeyId = accessKeyId
        if (secretAccessKey) config.secretAccessKey = secretAccessKey

        saveGlobalConfig(fullConfig)
      })
      .then(resolve)
      .catch(reject)
  })
}
