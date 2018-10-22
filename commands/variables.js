const l = require("../logger.js")
const inquirer = require("inquirer")
const argv = require("simple-argv")
const { getProjectInfo, getRequiredEnv, notNullValidator, saveLocalValkconfig, getAWSCredentials, getDefaultProfile, promiseWaterfall } = require("../utils.js")
const { encrypt, createKey, decrypt } = require("../lib/kms")
const { flags: { profile: profileFlag } } = require("../lib/const.js")
const cwd = process.cwd()
const Table = require("cli-table")

let valkconfig
try {
  valkconfig = getProjectInfo().valkconfig
} catch(e) {}

const getValkconfigRequiredKey = (...keys) => {
  return keys.reduce((acc, key, i) => {
    if (typeof acc[key] === "undefined") {
      throw new Error(`Missing valkconfig ${keys.slice(0, i + 1).join(".")} key`)
    }
    return acc[key]
  }, valkconfig)
}

const addEnvVariable = (name, value, env) => {
  const lambda = getValkconfigRequiredKey("Environments", env, "Lambda")
  if (!lambda.Environment) {
    lambda.Environment = { Variables: {} }
  }
  if (!lambda.Environment.Variables) {
    lambda.Environment.Variables = {}
  }
  lambda.Environment.Variables[name] = value
  saveLocalValkconfig(cwd, valkconfig)
  l.success("Variables successfully updated")
  listVariables(env, true)
}

const listVariables = (env, decrypt = false) => {
  const variables = getValkconfigRequiredKey("Environments", env, "Lambda", "Environment", "Variables")
  const table = new Table({
    head: ["Name", "Value", "Encryption"].map(header => `${l.colors.yellow}${header}${l.colors.reset}`)
  })
  return promiseWaterfall(Object.keys(variables).map(name => () => showVariable(name, env).then(values => table.push(values))))
    .then(() => console.log(table.toString()))
}

const decryptVariable = value => {
  const credentials = getAWSCredentials(argv.profile || getDefaultProfile())
  return decrypt(value, credentials, valkconfig.Project.Region)
}

const showVariable = (name, env) => {
  const value = getValkconfigRequiredKey("Environments", env, "Lambda", "Environment", "Variables")[name]
  const { KMS } = valkconfig.Environments[env]
  if (KMS && KMS.EncryptedVariables && KMS.EncryptedVariables.includes(name)) {
    return decryptVariable(value)
      .then(decryptedValue => [name, `${decryptedValue.length > 25 ? `${decryptedValue.slice(0, 25)}...` : decryptedValue} (${l.colors.green}decrypted${l.colors.reset})`, "    🔒    "])
      .catch(err => {
        if (err.code === "AccessDeniedException") {
          return [name, `${value.slice(0, 25)}... (${l.colors.red}encrypted${l.colors.reset})`, "    🔒    "]
        } else {
          throw err
        }
      })
  } else {
    return Promise.resolve([name, value.length > 25 ? `${value.slice(0, 25)}...` : value, ""])
  }
}

const encryptVariable = (name, env) => {
  const credentials = getAWSCredentials(argv.profile || getDefaultProfile())
  const { KMS } = getValkconfigRequiredKey("Environments", env) || {}
  if (KMS && KMS.EncryptedVariables && KMS.EncryptedVariables.includes(name)) {
    throw new Error(`Variable "${name}" already encrypted`)
  }
  return Promise.resolve()
    .then(() => {
      try {
        return getValkconfigRequiredKey("Environments", env, "KMS").KeyId
      } catch(_) {
        return createKey(`${getProjectInfo().pkg.name}-${env}`, credentials, valkconfig.Project.Region)
          .then(keyId => {
            getValkconfigRequiredKey("Environments", env).KMS = { KeyId: keyId }
            saveLocalValkconfig(cwd, valkconfig)
            return keyId
          })
      }
    })
    .then(keyId => {
      const variables = getValkconfigRequiredKey("Environments", env, "Lambda", "Environment", "Variables")
      return encrypt(keyId, variables[name], credentials, valkconfig.Project.Region)
        .catch(err => {
          if (err.code === "NotFoundException") {
            throw new Error("The KMS Key does not exist in your currently selected account or you are not allowed to perform this action")
          } else {
            throw err
          }
        })
    })
    .then(encryptedValue => {
      if (KMS.EncryptedVariables) {
        KMS.EncryptedVariables.push(name)
      } else {
        KMS.EncryptedVariables = [name]
      }
      saveLocalValkconfig(cwd, valkconfig)
      addEnvVariable(name, encryptedValue, env)
    })
}

const getCurrentVariables = env => {
  const variables = Object.keys(getValkconfigRequiredKey("Environments", env, "Lambda", "Environment", "Variables"))
  if (variables.length) {
    return variables
  } else {
    throw new Error(`The ${env} environment doesn't have any variables`)
  }
}

module.exports = {
  description: "Configures and manages AWS credentials;",
  flags: [
    profileFlag,
    ...(valkconfig ? Object.keys(valkconfig.Environments).map(env => {
      return {
        name: env,
        description: `Creates for ${env} env;`
      }
    }) : []),
    {
      name: "create",
      description: "Create a variable"
    },
    {
      name: "encrypt",
      description: "Encrypt an env variable"
    },
    {
      name: "delete",
      description: "Delete an env variable"
    }
  ],
  fn: () => {
    return Promise.resolve()
      .then(() => {
        if (typeof valkconfig === "undefined") {
          throw new Error("Missing valkconfig.json file")
        }
        let selectedEnv
        if (Object.keys(valkconfig.Environments).some(env => {
          if (argv[env]) {
            selectedEnv = env
            return true
          } else {
            return false
          }
        })) {
          return { env: selectedEnv }
        } else {
          return getRequiredEnv(valkconfig)
        }
      })
      .then(({ env }) => {
        if (argv.create) {
          return inquirer.prompt([
            { type: "input", name: "name", message: "Name:", validate: notNullValidator, required: true }
          ])
            .then(({ name }) => {
              let defaultValue
              try {
                defaultValue = getValkconfigRequiredKey("Environments", env, "Lambda", "Environment", "Variables")[name]
              } catch(_) {}
              return inquirer.prompt([{ type: "input", name: "value", message: "Value:", default: defaultValue, required: true }])
                .then(({ value }) => ({ value, name }))
            })
            .then(({ name, value }) => addEnvVariable(name, value, env))
        }
        if (argv.encrypt) {
          return inquirer.prompt([
            { type: "checkbox", name: "toEncrypt", choices: getCurrentVariables(env) }
          ]).then(({ toEncrypt }) => promiseWaterfall(toEncrypt.map(variable => () => encryptVariable(variable, env))))
        }

        if (argv.delete) {
          return inquirer.prompt([
            { type: "checkbox", name: "toDelete", choices: getCurrentVariables(env) }
          ])
            .then(({ toDelete }) => {
              if (toDelete.length) {
                valkconfig.Environments[env].Lambda.Environment.Variables = Object.entries(getValkconfigRequiredKey("Environments", env, "Lambda", "Environment", "Variables"))
                  .filter(([variableKey]) => !toDelete.includes(variableKey))
                  .reduce((acc, [key, value]) => {
                    acc[key] = value
                    return acc
                  }, {})
                if (valkconfig.Environments[env].KMS && valkconfig.Environments[env].KMS.EncryptedVariables) {
                  valkconfig.Environments[env].KMS.EncryptedVariables = valkconfig.Environments[env].KMS.EncryptedVariables.filter(variable => !toDelete.includes(variable))
                }
                saveLocalValkconfig(cwd, valkconfig)
              }
            })
        }
        return listVariables(env, true)
      })
      .catch(l.error)
  }
}
