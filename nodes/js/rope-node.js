var window = window || {}
const Kite = window.Kite || require('kite.js').Kite

const AUTO_RECONNECT = false
const LOG_LEVEL = Kite.DebugLevel.INFO
const ENVIRONMENT = window.Kite ? 'Browser' : 'Node.js'
const NAME = 'math'

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
  url: 'http://ropez.oud.cc:4480',
  transportClass: Kite.transport.SockJS,
  name: NAME,
  logLevel: LOG_LEVEL,
  environment: ENVIRONMENT,
  autoReconnect: AUTO_RECONNECT,
  api: api,
})

kite.connect()