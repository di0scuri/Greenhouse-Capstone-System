// src/polyfills.js
import { Buffer } from 'buffer'

// Create a minimal process object
window.process = window.process || {
  env: {},
  browser: true,
  stdout: { isTTY: false },
  stderr: { isTTY: false },
  platform: 'browser',
  version: '',
  versions: {},
  nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
  cwd: () => '/',
  exit: () => {},
  argv: []
}

window.Buffer = Buffer
window.global = window