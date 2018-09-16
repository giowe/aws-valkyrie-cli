const { generateRetryFn, getServiceInstance } = require("../utils.js")

const e = module.exports = { api: {} }

const getKmsInstance = e.getKmsInstance = getServiceInstance("KMS")

e.createKey = (name, credentials, region) => {
  const kms = getKmsInstance(credentials, region)
  return kms.createKey({ Description: `${name} KMS key` }).promise()
    .then(({ KeyMetadata: { KeyId } }) => {
      return kms.createAlias({
        AliasName: `alias/${name}`,
        TargetKeyId: KeyId
      }).promise().then(() => KeyId)
    })
}

e.encrypt = (keyId, value, credentials, region) => {
  const kms = getKmsInstance(credentials, region)
  return kms.encrypt({
    KeyId: keyId,
    Plaintext: value
  }).promise()
    .then(({ CiphertextBlob }) => new Buffer(CiphertextBlob).toString("base64"))
}

e.decrypt = (value, credentials, region) => {
  const kms = getKmsInstance(credentials, region)
  return kms.decrypt({
    CiphertextBlob: new Buffer(value, "base64")
  }).promise()
    .then(({ Plaintext }) => Plaintext.toString())
}
