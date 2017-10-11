import {
  PORT,
  MAX_QUERY_LIMIT,
  BLACKLIST_LIMIT,
  LOG_LEVEL,
  AUTH,
} from './constants'

import { Kite, KiteServer, KiteApi } from 'kite.js'
import readline from 'readline'
import uaParser from 'ua-parser-js'

export default class Server extends KiteServer {
  constructor(options = {}) {
    super({
      name: 'rope',
      logLevel: LOG_LEVEL,
      serverClass: KiteServer.transport.SockJS,
    })

    this.setApi(
      new KiteApi({
        auth: AUTH,
        methods: {
          query: this.bound('queryKite'),
          count: this.bound('getKiteCount'),
          run: this.bound('runOnKite'),
          subscribe: this.bound('subscribe'),
          unsubscribe: this.bound('unsubscribe'),
        },
      })
    )

    this.connections = new Map()
    this.events = new Map([
      ['node.added', new Set()],
      ['node.removed', new Set()],
    ])

    this.blackListCandidates = new Object()
    this.blackList = new Set()
  }

  handleMessage(proto, message) {
    let kite
    if (message.arguments[0] && (kite = message.arguments[0].kite)) {
      this.logger.debug(`${kite.id} requested to run ${message.method}`)
      this.logger.debug(proto)
      // do not touch internal methods
      if (!/^kite\./.test(message.method)) {
        let args = message.arguments[0].withArgs || {}
        message.arguments[0].withArgs = [{ args, requester: kite.id }]
      }
    }

    super.handleMessage(proto, message)
  }

  listen(port = PORT) {
    super.listen(port)
    this.server.on('connection', this.bound('registerConnection'))
    this.logConnectons()
  }

  getKiteInfo(kiteId) {
    let connection = this.connections.get(kiteId)

    if (!connection) {
      return { id: kiteId }
    }

    let { api, signatures, connectedFrom, kiteInfo } = connection
    return { id: kiteId, api, signatures, connectedFrom, kiteInfo }
  }

  queryKite({ args, requester }, callback) {
    const method = args.method
    let res = []

    if (method) {
      for (let [kiteId, connection] of this.connections) {
        if (connection.api.includes(method)) {
          res.push(kiteId)
        }
        if (res.length >= MAX_QUERY_LIMIT) break
      }
    } else {
      res = Array.from(this.connections.keys()).slice(0, MAX_QUERY_LIMIT)
      if (res.indexOf(requester) < 0) res[0] = requester
    }

    callback(null, res.map(this.bound('getKiteInfo')))
  }

  getKiteCount(options, callback) {
    callback(null, this.connections.size)
  }

  runOnKite(options, callback) {
    const { kiteId, method, args = [] } = options.args

    this.connections
      .get(kiteId)
      .kite.tell(method, args)
      .then(res => callback(null, res))
      .catch(err => callback(err))
  }

  getConnection(requester) {
    const connection = this.connections.get(requester)
    if (!connection || !connection.api.includes('rope.notify'))
      return [{ message: 'Notifications not supported for this node' }]
    return [null, connection]
  }

  getSubscribers(eventName) {
    const subscribers = this.events.get(eventName)
    if (!subscribers) return [{ message: 'Event not supported!' }]
    return [null, subscribers]
  }

  handleSubscription({ requester, eventName, message, subscribe }) {
    var [err, connection] = this.getConnection(requester)
    if (err) return [err]

    var [err, subscribers] = this.getSubscribers(eventName)
    if (err) return [err]

    if (subscribe) subscribers.add(requester)
    else subscribers.delete(requester)

    this.events.set(eventName, subscribers)

    this.logger.debug('events now', this.events.entries())
    return [null, message]
  }

  subscribe({ args: eventName, requester }, callback) {
    callback.apply(
      this,
      this.handleSubscription({
        eventName,
        requester,
        subscribe: true,
        message: `Now subscribed to ${eventName}`,
      })
    )
  }

  unsubscribe({ args: eventName, requester }, callback) {
    callback.apply(
      this,
      this.handleSubscription({
        eventName,
        requester,
        subscribe: false,
        message: `Now ubsubscribed from ${eventName}`,
      })
    )
  }

  unsubscribeFromAll(kiteId) {
    let event, subscribers
    for ([event, subscribers] of this.events) {
      subscribers.delete(kiteId)
      this.events.set(event, subscribers)
    }
    this.logger.debug('events now', this.events.entries())
  }

  logConnectons() {
    if (LOG_LEVEL == 0) {
      process.stdout.write(`\rConnected kites ${this.connections.size}   `)
      readline.cursorTo(process.stdout, 0)
    } else {
      this.logger.info('Connected kites', this.connections.size)
    }
  }

  notifyNodes(event, kiteId) {
    const kiteInfo = this.getKiteInfo(kiteId)
    const notification = { event, kiteInfo }

    this.logger.info('notifying', this.events.get(event))

    for (let node of this.events.get(event)) {
      this.connections.get(node).kite.tell('rope.notify', notification)
    }
  }

  registerConnection(connection) {
    const headers = connection.connection.headers
    const remoteIp =
      headers['x-forwarded-for'] || connection.connection.remoteAddress

    if (this.blackList.has(remoteIp)) {
      this.logger.debug('connection request from blacklisted ip', remoteIp)
      connection.close()
      return
    }

    const connectionId = connection.getId()
    const { kite } = connection

    kite
      .tell('rope.identify', connectionId)
      .then(info => {
        this.logger.debug('kiteinfo', info)
        const { kiteInfo, useragent, api = [], signatures = {} } = info
        const { id: kiteId } = kiteInfo

        this.logger.info('A new kite registered with ID of', kiteId)

        const identifyData = { id: kiteId }
        if (kiteInfo.environment == 'Browser' && useragent) {
          let { browser } = uaParser(useragent)
          let environment = `${browser.name} ${browser.version}`
          kiteInfo.environment = identifyData.environment = environment
        }
        kite.tell('rope.identified', [identifyData])

        this.connections.set(kiteId, {
          api,
          kite,
          headers,
          kiteInfo,
          signatures,
          connectedFrom: remoteIp,
        })

        this.notifyNodes('node.added', kiteId)
        this.logConnectons()

        connection.on('close', () => {
          this.logger.info('A kite left the facility :(', kiteId)
          this.connections.delete(kiteId)
          this.unsubscribeFromAll(kiteId)
          this.notifyNodes('node.removed', kiteId)
          this.logConnectons()
        })
        return info
      })
      .catch(err => {
        this.logger.error('Error while register connection', err)
        this.logger.info('Dropping outdated kite', connectionId, remoteIp)
        this.blackListCandidates[remoteIp] |= 0
        this.blackListCandidates[remoteIp]++
        if (this.blackListCandidates[remoteIp] > BLACKLIST_LIMIT) {
          console.log(`Connections from ${remoteIp} blacklisted`)
          this.blackList.add(remoteIp)
        }
        connection.close()
      })
  }
}
