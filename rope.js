const readline = require('readline')
const MAX_QUERY_LIMIT = 20
const BLACKLIST_LIMIT = 10

const { Kite, KiteServer } = require('kite.js')
const uaParser = require('ua-parser-js')

const connections = new Map()
const events = new Map([['node.added', new Set()], ['node.removed', new Set()]])

const LOG_LEVEL = process.env.KITEDEBUG || 0
const AUTH = false

function debug(...message) {
  rope.emit('debug', ...message)
}

function getKiteInfo(kiteId) {
  const connection = connections.get(kiteId)
  if (!connection) {
    return { id: kiteId }
  }
  const { api, signatures, connectedFrom, kiteInfo } = connection
  return { id: kiteId, api, signatures, connectedFrom, kiteInfo }
}

function queryKite({ args, requester }, callback) {
  const method = args.method

  let res = []
  if (method) {
    for (let [kiteId, connection] of connections) {
      if (connection.api.includes(method)) {
        res.push(kiteId)
      }
      if (res.length >= MAX_QUERY_LIMIT) break
    }
  } else {
    res = Array.from(connections.keys()).slice(0, MAX_QUERY_LIMIT)
    if (res.indexOf(requester) < 0) res[0] = requester
  }

  callback(null, res.map(getKiteInfo))
}

function getKiteCount(options, callback) {
  callback(null, connections.size)
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
  if (!connection || !connection.api.includes('rope.notify'))
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
    count: getKiteCount,
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
  if (LOG_LEVEL == 0) {
    process.stdout.write(`\rConnected kites ${connections.size}   `)
    readline.cursorTo(process.stdout, 0)
  } else {
    rope.emit('info', 'Connected kites', connections.size)
  }
}

function notifyNodes(event, kiteId) {
  const kiteInfo = getKiteInfo(kiteId)
  notification = { event, kiteInfo }

  for (let node of events.get(event)) {
    connections.get(node).kite.tell('rope.notify', notification)
  }
}

const blackListCandidates = new Object()
const blackList = new Set()

function registerConnection(connection) {
  const headers = connection.connection.headers
  const remoteIp = headers['x-forwarded-for']

  if (blackList.has(remoteIp)) {
    connection.close()
    return
  }

  const connectionId = connection.getId()
  const { kite } = connection

  kite
    .tell('rope.identify', connectionId)
    .then(function(info) {
      const { kiteInfo, useragent, api = [], signatures = {} } = info
      const { id: kiteId } = kiteInfo

      rope.emit('info', 'A new kite registered with ID of', kiteId)
      const identifyData = { id: kiteId }
      if (kiteInfo.environment == 'Browser' && useragent) {
        let { browser } = uaParser(useragent)
        let environment = `${browser.name} ${browser.version}`
        kiteInfo.environment = identifyData.environment = environment
      }
      kite.tell('rope.identified', [identifyData])

      const connectedFrom = remoteIp
      connections.set(kiteId, {
        kiteInfo,
        api,
        kite,
        headers,
        signatures,
        connectedFrom,
      })

      notifyNodes('node.added', kiteId)
      logConnectons()

      connection.on('close', function() {
        rope.emit('info', 'A kite left the facility :(', kiteId)
        connections.delete(kiteId)
        unsubscribeFromAll(kiteId)
        notifyNodes('node.removed', kiteId)
        logConnectons()
      })
      return info
    })
    .catch(err => {
      rope.emit('info', 'Dropping outdated kite', connectionId, remoteIp)
      blackListCandidates[remoteIp] |= 0
      blackListCandidates[remoteIp]++
      if (blackListCandidates[remoteIp] > BLACKLIST_LIMIT) {
        console.log(`Connections from ${remoteIp} blacklisted`)
        blackList.add(remoteIp)
      }
      connection.close()
    })
}

rope.listen(80)
rope.server.on('connection', registerConnection)
logConnectons()
