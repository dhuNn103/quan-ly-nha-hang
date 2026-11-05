const isColor = process.stdout.isTTY;

const colors = {
  reset: isColor ? '\x1b[0m' : '',
  dim: isColor ? '\x1b[2m' : '',
  bright: isColor ? '\x1b[1m' : '',
  cyan: isColor ? '\x1b[36m' : '',
  green: isColor ? '\x1b[32m' : '',
  yellow: isColor ? '\x1b[33m' : '',
  red: isColor ? '\x1b[31m' : '',
  magenta: isColor ? '\x1b[35m' : '',
  blue: isColor ? '\x1b[34m' : ''
};

function timestamp() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

const logger = {
  info(...args) {
    console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.green}[INFO]${colors.reset}`, ...args);
  },
  warn(...args) {
    console.warn(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset}`, ...args);
  },
  error(...args) {
    console.error(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.red}[ERROR]${colors.reset}`, ...args);
  },
  http(method, url, status, durationMs, ip) {
    let statusColor = colors.green;
    if (status >= 500) statusColor = colors.red;
    else if (status >= 400) statusColor = colors.yellow;
    else if (status >= 300) statusColor = colors.cyan;

    const ms = `${durationMs.toFixed(1)}ms`.padStart(7);
    const code = `${statusColor}${status}${colors.reset}`;
    const m = `${colors.bright}${method.padEnd(6)}${colors.reset}`;
    console.log(`${colors.dim}[${timestamp()}]${colors.reset} ${colors.blue}[HTTP]${colors.reset} ${ip.padEnd(15)} | ${m} ${code} ${ms} | ${url}`);
  }
};

module.exports = logger;
