var window = window || {}
const Kite = window.Kite || require('kite.js').Kite

const AUTO_RECONNECT = false
const LOG_LEVEL = 4
const ENVIRONMENT = window.Kite ? 'browser-environment' : 'node-environment'
const NAME = 'math'

var publicKites = []

const api = {
  identified: function(id) {
    kite.emit('info', 'Now identified with', id)

    kite.tell('query', [null]).then(function(res) {
      kite.emit('info', 'following kites found on rope', (publicKites = res))
    })
  },
  identify: function(id, callback) {
    // kite.emit('info', 'identify requested, doing now...', id)
    callback(null, { api: api, kiteInfo: kite.getKiteInfo() })
  },
  square: function(number, callback) {
    callback(null, number * number)
  },
}

var kite = new Kite({
  url: 'ws://0.0.0.0:8080/websocket',
  name: NAME,
  logLevel: LOG_LEVEL,
  environment: ENVIRONMENT,
  autoReconnect: AUTO_RECONNECT,
  api: api,
})

// console.log(kite.api.methods)
kite.connect()
