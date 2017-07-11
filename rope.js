kiteJS = require('kite.js')
const Kite = kiteJS.Kite
const KiteServer = kiteJS.KiteServer

const connections = new Map()

const LOG_LEVEL = Kite.DebugLevel.DEBUG
const AUTH = false

function queryKite(args, callback) {
  if (!callback && typeof args == 'function') {
    callback = args
  }
  args = args || {}

  if (Object.keys(args).length) {
    let res = []

    for (let [kiteId, connection] of connections) {
      if (args.method && connection.api.includes(args.method)) {
        res.push(kiteId)
      }
    }
    callback(null, res)
  } else {
    callback(null, Array.from(connections.keys()))
  }
}

function runOnKite(options, callback) {
  const kiteId = options.kiteId
  const method = options.method
  const args = options.args || []

  // rope.emit('info', 'running on kite', kiteId, method)
  connections
    .get(kiteId)
    .kite.tell(method, args)
    .then(function(res) {
      callback(null, res)
    })
    .catch(function(err) {
      callback(err)
    })
}

const rope = new KiteServer({
  name: 'rope',
  auth: AUTH,
  logLevel: LOG_LEVEL,
  serverClass: KiteServer.transport.SockJS,
  api: {
    query: queryKite,
    run: runOnKite,
  },
})

function logConnectons() {
  rope.emit('info', 'Connected kites are now:', Array.from(connections.keys()))
}

function registerConnection(connection) {
  connection.kite.tell('identify', [connection.getId()]).then(function(info) {
    const kiteInfo = info.kiteInfo
    const kiteId = kiteInfo.id
    const api = info.api

    rope.emit('info', 'A new kite registered with ID of', kiteId)
    connection.kite.tell('identified', [kiteId])

    connections.set(kiteId, {
      kiteInfo: kiteInfo,
      kite: connection.kite,
      api: api,
    })

    connection.on('close', function() {
      rope.emit('info', 'A kite left the facility :(', kiteId)
      connections.delete(kiteId)
      logConnectons()
    })
  })
}

rope.listen(8080)
rope.server.on('connection', registerConnection)
