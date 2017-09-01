// Rope Gateway
const ROPELIVE = 'https://secure.rope.live'

// Check for browser
var window = window || {}

// Get kite.js
const Kite = window.Kite || require('kite.js').Kite
const inBrowser = !!window.Kite

// Create dummy process
if (inBrowser) {
  process = { env: { ROPEHOST: ROPELIVE, ROPEDEBUG: Kite.DebugLevel.INFO } }
  document.body.appendChild(
    document.createTextNode('Rope-Node-JS: Check console logs for details.')
  )
}

// Defaults for Kite instance
const NAME = 'rope-node-js'
const ROPEHOST = process.env.ROPEHOST || ROPELIVE
const LOG_LEVEL = process.env.ROPEDEBUG || Kite.DebugLevel.INFO
const ENVIRONMENT = inBrowser ? 'Browser' : 'Node.js ' + process.version
const AUTO_RECONNECT = true

// The rope-node api
const api = {
  'rope.identified': res => {
    if (res.environment) {
      kite.environment = res.environment
    }
    kite.emit('info', `Identified as ${res.id} now!`)
  },
  'rope.identify': (id, callback) => {
    kite.emit('info', 'Identify requested!')
    const kiteInfo = {
      api: Object.keys(api),
      kiteInfo: kite.getKiteInfo(),
      signatures: {
        square: 'Number, Function',
      },
    }
    if (inBrowser) kiteInfo.useragent = navigator.userAgent
    callback(null, kiteInfo)
  },
  'rope.notify': notification => {
    console.log('Notification:', notification)
  },
  square: (number, callback) => {
    callback(null, number * number)
  },
}

// Create the rope-node Kite instance
var kite = new Kite({
  url: ROPEHOST,
  transportClass: Kite.transport.SockJS,
  name: NAME,
  logLevel: LOG_LEVEL,
  environment: ENVIRONMENT,
  autoReconnect: AUTO_RECONNECT,
  api: api,
})

// Connect!
kite.connect()
