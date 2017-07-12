kiteJS = require('kite.js')
const Kite = kiteJS.Kite
const KiteServer = kiteJS.KiteServer

const connections = new Map()
const events = new Map([['node.added', []], ['node.removed', []]])

// const LOG_LEVEL = Kite.DebugLevel.INFO
const LOG_LEVEL = Kite.DebugLevel.DEBUG
const AUTH = false

function debug(...message) {
  rope.emit('debug', ...message)
}

function queryKite({ args, requester }, callback) {
  const method = args.method

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
  const { kiteId, method, args = [] } = options.args

  connections
    .get(kiteId)
    .kite.tell(method, args)
    .then(res => callback(null, res))
    .catch(err => callback(err))
}

function subscribe({ args: eventName, requester }, callback) {
  const connection = connections.get(requester)
  if (!connection || !connection.api.includes('notify'))
    return callback({ message: 'Notifications not supported for this node' })

  const event = events.get(eventName)
  if (!event) return callback({ message: 'Event not supported!' })

  event.push(requester)
  events.set(eventName, event)

  debug('events now', events.entries())
  callback(null, `Now subscribed to ${eventName}`)
}

function unsubscribe({ args: eventName, requester }, callback) {
  const connection = connections.get(requester)
  if (!connection || !connection.api.includes('notify'))
    return callback({ message: 'Notifications not supported for this node' })

  const event = events.get(eventName)
  if (!event) return callback({ message: 'Event not supported!' })

  events.set(eventName, event.filter(kiteId => kiteId != requester))

  debug('events now', events.entries())
  callback(null, `Now ubsubscribed from ${eventName}`)
}

function unsubscribeFromAll(kiteId) {
  for ([event, listeners] of events) {
    events.set(event, listeners.filter(node => node != kiteId))
  }
  debug('events now', events.entries())
}

const rope = new KiteServer({
  name: 'rope',
  auth: AUTH,
  logLevel: LOG_LEVEL,
  serverClass: KiteServer.transport.SockJS,
  api: {
    query: queryKite,
    run: runOnKite,
    subscribe: subscribe,
    unsubscribe: unsubscribe,
  },
})

rope.handleMessage = function(proto, message) {
  if ((kite = message.arguments[0].kite)) {
    debug(`${kite.id} requested to run ${message.method}`)
    if (!/^kite\./.test(message.method)) {
      // do not touch internal methods
      let args = message.arguments[0].withArgs || {}
      message.arguments[0].withArgs = [{ args, requester: kite.id }]
    }
  }

  KiteServer.prototype.handleMessage.call(rope, proto, message)
}

function logConnectons() {
  rope.emit('info', 'Connected kites are now:', Array.from(connections.keys()))
}

function notifyNodes(notification = {}) {
  const nodesToNotify = Array.from(events.get(notification.event) || [])

  nodesToNotify.forEach(node => {
    connections.get(node).kite.tell('notify', notification)
  })
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

    notifyNodes({ event: 'node.added', node: { kiteId, api } })

    connection.on('close', function() {
      rope.emit('info', 'A kite left the facility :(', kiteId)
      connections.delete(kiteId)
      unsubscribeFromAll(kiteId)
      notifyNodes({ event: 'node.removed', node: { kiteId } })
      logConnectons()
    })
  })
}

rope.listen(8080)
rope.server.on('connection', registerConnection)
