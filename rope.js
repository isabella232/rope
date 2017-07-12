kiteJS = require('kite.js')
const Kite = kiteJS.Kite
const KiteServer = kiteJS.KiteServer

const connections = new Map()

// const LOG_LEVEL = Kite.DebugLevel.INFO
const LOG_LEVEL = Kite.DebugLevel.DEBUG
const AUTH = false

function queryKite(args, callback) {
  const method = args.method
  const requester = args._requester

  if (method) {
    let res = []

    for (let [kiteId, connection] of connections) {
      if (connection.api.includes(method)) {
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

rope.handleMessage = function(proto, message) {
  if ((kite = message.arguments[0].kite)) {
    rope.emit('debug', `${kite.id} requested to run ${message.method}`)
    args = message.arguments[0].withArgs
    if (Array.isArray(args) && args.length == 0) {
      args.push({ _requester: kite.id })
    } else {
      args._requester = kite.id
    }
  }
  KiteServer.prototype.handleMessage.call(rope, proto, message)
}

function logConnectons() {
  rope.emit('info', 'Connected kites are now:', Array.from(connections.keys()))
}

function notifyNodes(notification = {}) {
  let exclude = notification.exclude
  delete notification.exclude
  for (let [kiteId, connection] of connections) {
    if (!connection.notify || kiteId == exclude) continue
    connection.kite.tell('notify', notification)
  }
}

function registerConnection(connection) {
  connection.kite.tell('identify', [connection.getId()]).then(function(info) {
    const kiteInfo = info.kiteInfo
    const kiteId = kiteInfo.id
    const api = info.api || []

    rope.emit('info', 'A new kite registered with ID of', kiteId)
    connection.kite.tell('identified', [kiteId])

    connections.set(kiteId, {
      kiteInfo: kiteInfo,
      kite: connection.kite,
      api: api,
      notify: Array.from(api).includes('notify'),
    })

    notifyNodes({ exclude: kiteId, type: 'node.added', node: { kiteId, api } })

    connection.on('close', function() {
      rope.emit('info', 'A kite left the facility :(', kiteId)
      connections.delete(kiteId)
      notifyNodes({ type: 'node.removed', node: { kiteId } })
      logConnectons()
    })
  })
}

rope.listen(8080)
rope.server.on('connection', registerConnection)
