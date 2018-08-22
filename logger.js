/* eslint-disable no-console */
const argv = require("simple-argv")
const { Spinner } = require("cli-spinner")

const e = module.exports = {}

const colors = e.colors = {
  "reset": "\x1b[0m",
  "bright": "\x1b[1m",
  "dim": "\x1b[2m",
  "underscore": "\x1b[4m",
  "blink": "\x1b[5m",
  "reverse": "\x1b[7m",
  "hidden": "\x1b[8m",
  "black": "\x1b[30m",
  "red": "\x1b[31m",
  "green": "\x1b[32m",
  "yellow": "\x1b[33m",
  "blue": "\x1b[34m",
  "magenta": "\x1b[35m",
  "cyan": "\x1b[36m",
  "white": "\x1b[37m",
  "crimson": "\x1b[38m",
  "bg": {
    "black": "\x1b[40m",
    "red": "\x1b[41m",
    "green": "\x1b[42m",
    "yellow": "\x1b[43m",
    "blue": "\x1b[44m",
    "magenta": "\x1b[45m",
    "cyan": "\x1b[46m",
    "white": "\x1b[47m",
    "crimson": "\x1b[48m"
  }
}

const prefix = e.prefix = `[${colors.yellow}VALK${colors.reset}]`

e.log = (color, ...args) => {
  stopSpinner()
  const options = { prefix: true, inline: false }
  if (typeof args[args.length - 1] === "object") Object.assign(options, args.pop())
  args.unshift(color)
  if (options.prefix) args.unshift(prefix)

  if (!options.inline) console.log(...args, colors.reset)
  else process.stdout.write(`${args.map(arg => {
    switch (typeof arg) {
      case "string": return arg
      case "object": return JSON.stringify(arg, null, 2)
      default: return "" + arg
    }
  }).join(" ")}${colors.reset}`)
}

e.frame = (text, options = { prefix: true }) => {
  stopSpinner()
  const border = "─".repeat(text.replace(/\u001b\[.*?m/g, "").length + 2)
  const padding = options.prefix ? " ".repeat(7) : ""
  console.log([
    `${padding}┌${border}┐`,
    `${options.prefix ? `${prefix} ` : "" }│ ${text}${colors.reset} │`,
    `${padding}└${border}┘`
  ].join("\n"))
}

e.fail = (...args) => {
  e.log(`[${colors.red}FAILURE${colors.reset}]`, ...args)
}

e.error = (err) => {
  e.log(`[${colors.red}ERROR${colors.reset}]`,  err === "string" ? err : (argv.verbose || argv.debug) ? `\n${err.stack}` : err.message)
}

e.warning = (err) => {
  e.log(`[${colors.yellow}WARNING${colors.reset}]`, typeof err === "string" ? err : (argv.verbose || argv.debug) ? `\n${err.stack}` : err.message)
}

e.success = (...args) => {
  e.log(`[${colors.green}SUCCESS${colors.reset}]`, ...args)
}

e.debug = (...args) => {
  if (argv.debug) e.log(`[${colors.magenta}DEBUG${colors.reset}]`, ...args)
}

e.wait = (...args) => {
  stopSpinner()
  const options = { prefix: true }
  if (typeof args[args.length - 1] === "object") Object.assign(options, args.pop())
  spinner.text = `${options.prefix ? `${prefix} ` : ""}[${colors.white}WAIT${colors.reset}] ${args.join(" ")} %s`
  spinner.start()
}

const spinner = new Spinner()
spinner.setSpinnerString("\\|/-")
const stopSpinner = () => {
  if (spinner.isSpinning()) spinner.stop(true)
}
