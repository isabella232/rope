const ROPELIVE = 'https://secure.rope.live' 
// Check for browser
var window = window || {}
const inBrowser = !!window.Kite
if (inBrowser) process = { env: { ROPEHOST: ROPELIVE, ROPEDEBUG: Kite.DebugLevel.INFO } }

// Get kite.js
const Kite = window.Kite || require('kite.js').Kite

// Defaults for Kite instance
const AUTO_RECONNECT = true
const LOG_LEVEL = process.env.ROPEDEBUG || Kite.DebugLevel.INFO
const NAME = 'rope-node-js'
const ROPEHOST = process.env.ROPEHOST || ROPELIVE
const ENVIRONMENT = inBrowser ? 'Browser' : 'Node.js ' + process.version

// The rope-node api
const api = {
  identified: function(res) {
    if (res.environment) {
      kite.environment = res.environment
    }
    kite.emit('info', `Identified as ${res.id} now!`)
  },
  identify: function(id, callback) {
    kite.emit('info', 'Identify requested!')
    const kiteInfo = { api: Object.keys(api), kiteInfo: kite.getKiteInfo() }
    if (inBrowser) kiteInfo.useragent = navigator.userAgent
    callback(null, kiteInfo)
  },
  notify: function(notification) {
    console.log('Notification:', notification)
  },
  square: function(number, callback) {
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
