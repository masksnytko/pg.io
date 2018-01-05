'use strict';

const net = require('net');
const crypto = require('crypto');
const Events = require('events.io');
const Queue = require('queue.o');
const PostgresType = require('./pg-type');

const SFCC = String.fromCharCode;
const md5 = s => crypto.createHash('md5').update(s, 'utf-8').digest('hex');
const Int16BE = n => SFCC(n>>>8&0xFF, n>>>0&0xFF);
const Int32BE = n => SFCC(n>>>24&0xFF, n>>>16&0xFF, n>>>8&0xFF, n>>>0&0xFF);
const postgresMd5PasswordHash = (user, password, salt) => 'md5'+md5(Buffer.concat([Buffer.from(md5(password+user)), salt]));

const Z = SFCC(0);
const ZZ = SFCC(0, 0);
const ZZZ = SFCC(0, 0, 0);
const ZZZZ = SFCC(0, 0, 0, 0);
const Ignore = Symbol('Ignore');
const DEHSComande = 'D'+Int32BE(6)+'P'+Z+'E'+Int32BE(9)+Z+Int32BE(0)+'H'+Int32BE(4)+'S'+Int32BE(4);
const PG_TYPE = new PostgresType;

class Connection {
    constructor(options) {
        this._rowToJSON = options.rowFormat === 'JSON';
        this._database = options.database || 'postgres';
        this._host = options.host || 'localhost';
        this._user = options.user || 'postgres';
        this._port = options.port || 5432;
        this._password = options.password;
        this._socket = new net.Stream;
        this._buf = Buffer.alloc(0);
        this._q = new Queue;
        this._fields = [];
        this._res = [];
        this.info = {};
    }
    connect(cb) {
        this.connectResponse = cb;
        this._socket.connect(this._port, this._host);
        this._socket.on('connect', () => {
            let str = 'user'+Z+this._user+Z+'database'+Z+this._database+Z+'client_encoding'+Z+"'utf-8'"+ZZ;
            this._socket.write(Int32BE(str.length+8)+Int32BE(196608)+str);
        });
        this._socket.on('data', buf => {

            if (this._buf.length === 0) {
                this._buf = buf;
            } else {
                this._buf = Buffer.concat([this._buf, buf]);
            }

            while (this._buf.length > 4) {

                this._len = this._buf.readInt32BE(1);

                if (this._len >= this._buf.length) {
                    break;
                }
                
                //console.log(this._buf[0], SFCC(this._buf[0]))

                switch (this._buf[0]) {
                    case 65: this.A(); break;
                    case 67: this.C(); break;
                    case 68: this.D(); break;
                    case 69: this.E(); break;
                    case 75: this.K(); break;
                    case 82: this.R(); break;
                    case 83: this.S(); break;
                    case 84: this.T(); break;
                }

                this._buf = this._buf.slice(this._len + 1);
            }
        });  
    }
    A() {
        let [type, v] = this._buf.utf8Slice(9, this._len).split(Z);

        if (v === '') {
            this.notificationResponse(type);
        } else {
            try {
                v = JSON.parse(v);
                this.notificationResponse(type, ...v);
            } catch (error) {
                this.notificationResponse(type, v);
            }
        }
    }
    R() {
        if (this._len === 12) {
            let str = postgresMd5PasswordHash(this._user, this._password, this._buf.slice(9));
            this._socket.write('p'+Int32BE(str.length+4)+str);
        } else if (this._len === 8 && this._buf.readInt32LE(5) === 0) {
            this.connectResponse();
        }
    }
    S() {
        let m = this._buf.utf8Slice(5, this._len).split(Z);
        this.info[m[0]] = m[1];
    }
    K() {
        this['PID'] = this._buf.readInt32LE(4);
        this['PID_KEY'] = this._buf.readInt32LE(8);
    }
    C() {
        let cb = this._q.shift();
        if (typeof cb === 'function') {
            cb(null, this._res);
            if (this._res.length !== 0) {
                this._res = [];
            }
        }
    }
    T() {
        
        if (this._q.first === Ignore) {
            return;
        }

        let buf = this._buf;
        let n = buf.readInt16BE(5);
        let index, offset = 7, name, typeId;

        for (var i = 0; i < n; i++) {
            index = offset;
            while (buf[index++] !== 0);

            if (this._rowToJSON === true) {
                name = buf.utf8Slice(offset, index - 1);
            } else {
                name = i;
            }

            offset = index + 6;
            this._fields[i] = [name, buf.readInt32BE(offset)];
            offset += 12;
        }
    }
    D() {
        if (this._q.first === Ignore) {
            return;
        }

        let buf = this._buf;
        let n = buf.readInt16BE(5);
        let offset = 7, len, res, F;
        
        if (this._rowToJSON === true) {
            res = {};
        } else {
            res = new Array(n);
        }
        
        for (var i = 0; i < n; i++) {
            len = buf.readInt32BE(offset);
            offset += 4;
            if (len === -1) {
                res[this._fields[i][0]] = null;
            } else {
                F = PG_TYPE[this._fields[i][1]];
                if (F === undefined) {
                    res[this._fields[i][0]] = buf.utf8Slice(offset, offset += len);
                } else {
                    res[this._fields[i][0]] = F(buf.utf8Slice(offset, offset += len));
                }
            }
        }

        this._res.push(res);
    }
    E() {
        let cb = this._q.shift();
        if (typeof cb === 'function') {
            cb(this._buf.utf8Slice(6, this._len));
        }
    }
    query(str, ...arg) {
        
        this._q.push(arg.pop());

        if (arg.length === 0) {
            this._socket.write('Q'+Int32BE(str.length + 5)+str+Z);
        } else {
            this._socket.write('P'+Int32BE(str.length + 8)+Z+str+ZZZ);

            let len = arg.length;
            let buf = ZZZZ + Int16BE(len);
            let val, i;

            for (i = 0; i < len; i++) {
                val = String(arg[i]);
                buf += Int32BE(val.length);
                buf += val;
            }

            buf += ZZ;

            this._socket.write('B'+Int32BE(buf.length + 4)+buf+DEHSComande);
        }
    }
}

class PoolConnection extends Events {
    constructor(options) {
        super();
        this._max = options.max || 1;
        this._options = options;
        this._pool = [];
        this._rr = 0;
        this._q = [];
        this._init();
    }
    _init() {
        for (var i = 0; i < this._max; i++) {
            let client = new Connection(this._options);
            client.notificationResponse = super.emit.bind(this);
            client.connect(() => {
                this._pool.push(client);
                if (this._pool.length === this._max) {
                    this._cleanQueue();
                    this._redefineQuery();
                }
            });
        }
    }
    _cleanQueue() {
        for (var i = 0; i < this._q.length; i++) {
            this._query.apply(this, this._q[i]);
        }
        delete this._q;
    }
    _redefineQuery() {
        this.query = this._query;
    }
    query(...arg) {
        let last = arg[arg.length - 1];

        if (typeof last === 'function' || last === Ignore) {
            this._q.push(arg);
        } else {
            return new Promise((resolve, reject) => {
                arg.push((err, res) => {
                    if (err === null) {
                        resolve(res);
                    } else {
                        reject(err);
                    }
                });
                this._q.push(arg);
            });
        }
    }
    _query(...arg) {
        let last = arg[arg.length - 1];
        let client = this._pool[this._rr];
        
        this._rr++;
        this._rr %= this._max;
        
        if (typeof last === 'function' || last === Ignore) {
            client.query.apply(client, arg);
        } else {
            return new Promise((resolve, reject) => {
                arg.push((err, res) => {
                    if (err === null) {
                        resolve(res);
                    } else {
                        reject(err);
                    }
                });
                client.query.apply(client, arg);
            });
        }
    }
    on(type, cb) {
        super.on(`${type}`, cb);
        return this.query(`LISTEN "${type}"`);
    }
    once(type, cb) {
        super.once(`${type}`, (...arg) => {
            this.query(`UNLISTEN "${type}"`, Ignore);
            cb(...arg);
        });
        return this.query(`LISTEN "${type}"`);
    }
    emit(type, ...arg) {
        if (arg.length === 0) {
            this.query(`NOTIFY "${type}"`, Ignore);
        } else {
            this.query(`NOTIFY "${type}", '${JSON.stringify(arg)}'`, Ignore);
        }
    }
    setType(code, cb) {
        PG_TYPE[code] = cb;
    }
}

module.exports = PoolConnection;