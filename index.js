'use strict';

const Events = require('events.io');
const PostgresType = require('./lib/pg-type');
const Connection = require('./lib/connection');
const Ignore = Symbol('Ignore');

class PoolConnection extends Events {
    constructor(options) {
        super();
        this._rr = 0;
        this.max = options.max || 1;
        this.pgType = new PostgresType;
        this.pool = [];

        let i, notifiy = super.emit.bind(this);
        for (i = 0; i < this.max; ++i) {
            this.pool[i] = new Connection(options, notifiy, this.pgType);
        }
    }
    query(text, ...arg) {
        let last = arg[arg.length - 1];
        let client = this.pool[this._rr];

        if (typeof last === 'function' || last === Ignore) {
            client.query(text, arg, arg.pop());
        } else {
            return new Promise((resolve, reject) => {
                client.query(text, arg, (err, res) => {
                    if (err === null) {
                        resolve(res);
                    } else {
                        reject(err);
                    }
                });
            });
        }

        this._rr++;
        this._rr %= this.max;
    }
    on(type, cb) {
        super.on(type, cb);

        if (super.listenerCount(type) === 1) {
            return this.query(`LISTEN "${type}"`, Ignore);
        }
    }
    once(type, cb) {
        super.once(type, (...arg) => {
            this.query(`UNLISTEN "${type}"`, Ignore);
            cb(...arg);
        });

        if (super.listenerCount(type) === 1) {
            return this.query(`LISTEN "${type}"`, Ignore);
        }
    }
    emit(type, ...arg) {
        if (arg.length === 0) {
            this.query(`NOTIFY "${type}"`, Ignore);
        } else {
            this.query(`NOTIFY "${type}", '${JSON.stringify(arg)}'`, Ignore);
        }
    }
    setType(code, cb) {
        this.pgType[code] = cb;
    }
}

module.exports = PoolConnection;