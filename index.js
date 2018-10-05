const Connection = require('./lib/connection');
const PostgresType = require('./lib/pg-type');
const Events = require('events');

class PoolConnection extends Events {
    constructor(options) {
        super();
        this._rr = 0;
        this.max = options.max || 1;
        this.pgType = new PostgresType;
        this.pool = [];

        let notifiy = super.emit.bind(this);
        for (var i = 0; i < this.max; ++i) {
            this.pool[i] = new Connection(options, notifiy, this.pgType);
        }
    }
    get client() {
        this._rr++;
        this._rr %= this.max;
        return this.pool[this._rr];
    }
    query(...arg) {
        return this.client.query(...arg);
    }
    on(type, cb) {
        super.on(type, cb);
        if (super.listenerCount(type) === 1) {
            let client = this.client;
            if (client.ready) {
                client.query(`LISTEN "${type}"`);
            }
            client.on('ready', () => {
                client.query(`LISTEN "${type}"`);
            });
        }
    }
    emit(type, ...arg) {
        if (arg.length === 0) {
            return this.query(`NOTIFY "${type}"`);
        } else {
            return this.query(`NOTIFY "${type}", '${JSON.stringify(arg)}'`);
        }
    }
    setType(code, cb) {
        this.pgType[code] = cb;
    }
}

module.exports = PoolConnection;