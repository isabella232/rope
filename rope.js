Kite = require('kite.js')

const connections = new Object()

const LOG_LEVEL = 4
const AUTH = false

function queryKite(args, callback) {
  callback(null, Object.keys(connections))
}

function runOnKite(options, callback) {
  const kiteId = options.kiteId
  const method = options.method
  const args = options.args || []

  // rope.emit('info', 'running on kite', kiteId, method)
  connections[kiteId].kite
    .tell(method, args)
    .then(function(res) {
      callback(null, res)
    })
    .catch(function(err) {
      callback(err)
    })
}

const rope = new Kite.KiteServer({
  name: 'rope',
  auth: AUTH,
  logLevel: LOG_LEVEL,
  serverClass: Kite.KiteServer.transport.SockJS,
  api: {
    query: queryKite,
    run: runOnKite,
  },
})

function logConnectons() {
  rope.emit('info', 'Connected kites are now:', Object.keys(connections))
}

function registerConnection(connection) {
  const id = connection.getId()
  const mite = new Kite.Kite({
    url: id,
    name: 'remote',
    logLevel: LOG_LEVEL,
    autoConnect: false,
  })

  mite.ws = connection
  mite.onOpen()

  connection.removeAllListeners('message')

  const proto = new Kite.DnodeProtocol(rope.api.methods)
  proto.on('request', rope.lazyBound.call(rope, 'handleRequest', connection))

  connection.on('message', function(_message) {
    // rope.emit('info', 'got message from', id)
    const message = JSON.parse(_message)
    if (Object.keys(rope.api.methods).indexOf(message.method) > -1) {
      rope.handleMessage.call(rope, proto, _message)
    } else {
      if (message.arguments.length >= 2) {
        message.arguments = [
          { error: message.arguments[0], result: message.arguments[1] },
        ]
        _message = JSON.stringify(message)
      }
      mite.onMessage({ data: _message })
    }
  })

  mite.tell('identify', [id]).then(function(info) {
    const kiteInfo = info.kiteInfo
    const kiteId = kiteInfo.id
    const api = info.api

    rope.emit('info', 'A new kite registered with ID of', kiteId)
    mite.tell('identified', [kiteId])

    connections[kiteId] = {
      kiteInfo: kiteInfo,
      kite: mite,
      api: api,
    }

    connection.on('close', function() {
      rope.emit('info', 'A kite left the facility :(', kiteId)
      delete connections[kiteId]
      logConnectons()
    })
  })
}

rope.listen(8080)
rope.server.on('connection', registerConnection)
