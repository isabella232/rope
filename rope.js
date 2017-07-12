const { Kite, KiteServer } = require('kite.js')

const connections = new Map()
const events = new Map([['node.added', new Set()], ['node.removed', new Set()]])

const LOG_LEVEL = Kite.DebugLevel.INFO
// const LOG_LEVEL = Kite.DebugLevel.DEBUG
const AUTH = false

function debug(...message) {
  rope.emit('debug', ...message)
}

function getKiteInfo(kiteId) {
  const connection = connections.get(kiteId)
  if (!connection) {
    return { id: kiteId }
  }
  const { api, connectedFrom, kiteInfo } = connection
  return { id: kiteId, api, connectedFrom, kiteInfo }
}

function queryKite({ args, requester }, callback) {
  const method = args.method

  let res = []
  if (method) {
    for (let [kiteId, connection] of connections) {
      if (connection.api.includes(method)) {
        res.push(kiteId)
      }
    }
  } else {
    res = Array.from(connections.keys())
  }

  callback(null, res.map(getKiteInfo))
}

function runOnKite(options, callback) {
  const { kiteId, method, args = [] } = options.args

  connections
    .get(kiteId)
    .kite.tell(method, args)
    .then(res => callback(null, res))
    .catch(err => callback(err))
}

function getConnection(requester) {
  const connection = connections.get(requester)
  if (!connection || !connection.api.includes('notify'))
    return [{ message: 'Notifications not supported for this node' }]
  return [null, connection]
}

function getSubscribers(eventName) {
  const subscribers = events.get(eventName)
  if (!subscribers) return [{ message: 'Event not supported!' }]
  return [null, subscribers]
}

function handleSubscription({ requester, eventName, message, subscribe }) {
  var [err, connection] = getConnection(requester)
  if (err) return [err]

  var [err, subscribers] = getSubscribers(eventName)
  if (err) return [err]

  if (subscribe) subscribers.add(requester)
  else subscribers.delete(requester)

  events.set(eventName, subscribers)

  debug('events now', events.entries())
  return [null, message]
}

function subscribe({ args: eventName, requester }, callback) {
  callback.apply(
    this,
    handleSubscription({
      eventName,
      requester,
      subscribe: true,
      message: `Now subscribed to ${eventName}`,
    })
  )
}

function unsubscribe({ args: eventName, requester }, callback) {
  callback.apply(
    this,
    handleSubscription({
      eventName,
      requester,
      subscribe: false,
      message: `Now ubsubscribed from ${eventName}`,
    })
  )
}

function unsubscribeFromAll(kiteId) {
  for ([event, subscribers] of events) {
    subscribers.delete(kiteId)
    events.set(event, subscribers)
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

function notifyNodes(event, kiteId) {
  const kiteInfo = getKiteInfo(kiteId)
  kiteInfo.event = event

  for (let node of events.get(event)) {
    connections.get(node).kite.tell('notify', kiteInfo)
  }
}

function registerConnection(connection) {
  const connectionId = connection.getId()
  const { kite } = connection

  kite.tell('identify', connectionId).then(function(info) {
    const { kiteInfo, api = [] } = info
    const { id: kiteId } = kiteInfo

    rope.emit('info', 'A new kite registered with ID of', kiteId)
    kite.tell('identified', [kiteId])

    const connectedFrom = connectionId
    connections.set(kiteId, {
      kiteInfo,
      api,
      kite,
      connectedFrom,
    })

    notifyNodes('node.added', kiteId)

    connection.on('close', function() {
      rope.emit('info', 'A kite left the facility :(', kiteId)
      connections.delete(kiteId)
      unsubscribeFromAll(kiteId)
      notifyNodes('node.removed', kiteId)
      logConnectons()
    })
  })
}

rope.listen(8080)
rope.server.on('connection', registerConnection)
