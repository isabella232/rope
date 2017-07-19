var window = window || {}
const Kite = window.Kite || require('kite.js').Kite

const AUTO_RECONNECT = true 
const LOG_LEVEL = Kite.DebugLevel.INFO
const ENVIRONMENT = window.Kite ? 'Browser' : 'Node.js'
const NAME = 'rope-node-js'

if (!!window.Kite) {
  process = { env: {} }
}

const ROPEHOST = process.env.ROPEHOST || 'http://rope.live:8080'

var publicKites = []

const api = {
  identified: function(id) {
    kite.emit('info', 'Now identified with', id)

    kite.tell('query').then(function(res) {
      kite.emit('info', 'following kites found on rope', (publicKites = res))
    })
  },
  identify: function(id, callback) {
    callback(null, { api: Object.keys(api), kiteInfo: kite.getKiteInfo() })
  },
  notify: function(notification) {
    console.log('Notification:', notification)
  },
  square: function(number, callback) {
    callback(null, number * number)
  },
}

var kite = new Kite({
  url: ROPEHOST,
  transportClass: Kite.transport.SockJS,
  name: NAME,
  logLevel: LOG_LEVEL,
  environment: ENVIRONMENT,
  autoReconnect: AUTO_RECONNECT,
  api: api,
})

kite.connect()
