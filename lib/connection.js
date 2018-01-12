'use strict';

const { Stream } = require('net');
const Crypto = require('crypto');
const Queue = require('queue.o');

const SFCC = String.fromCharCode;
const Z = SFCC(0);
const ZZ = SFCC(0, 0);
const ZZZ = SFCC(0, 0, 0);
const ZZZZ = SFCC(0, 0, 0, 0);
const int16BE = n => SFCC(n >>> 8 & 0xFF, n >>> 0 & 0xFF);
const int32BE = n => SFCC(n >>> 24 & 0xFF, n >>> 16 & 0xFF, n >>> 8 & 0xFF, n >>> 0 & 0xFF);
const md5 = s => Crypto.createHash('md5').update(s, 'utf-8').digest('hex');
const postgresMd5PasswordHash = (user, password, salt) => 'md5' + md5(Buffer.concat([Buffer.from(md5(password + user)), salt]));
const DEHSComande = 'D' + int32BE(6) + 'P' + Z + 'E' + int32BE(9) + Z + int32BE(0) + 'H' + int32BE(4) + 'S' + int32BE(4);

class Connection extends Stream {
    constructor(options, notifiy, pgType) {
        super();
        this._rowToJSON = options.rowFormat === 'JSON';
        this._database = options.database || 'postgres';
        this._host = options.host || 'localhost';
        this._user = options.user || 'postgres';
        this._port = options.port || 5432;
        this._password = options.password;
        this._buf = Buffer.alloc(0);
        this._queue = new Queue;
        this._writeBuf = [];
        this._fields = [];
        this._res = [];

        this.info = {};
        this.ready = false;
        this.pgType = pgType;
        this.notifiy = notifiy;
        this.connect(this._port, this._host, () => {
            let str = 'user' + Z + this._user + Z + 'database' + Z + this._database + Z + 'client_encoding' + Z + "'utf-8'" + ZZ;
            this.write(int32BE(str.length + 8) + int32BE(196608) + str);
        });
        this.on('data', this.onData.bind(this));
    }
    query(str, arg, cb) {
        let buf;

        if (arg.length === 0) {
            buf = 'Q' + int32BE(str.length + 5) + str + Z;
        } else {
            let val, i, len = arg.length;
            buf = 'P' + int32BE(str.length + 8) + Z + str + ZZZ;
            str = ZZZZ + int16BE(len);

            for (i = 0; i < len; i++) {
                val = String(arg[i]);
                str += int32BE(val.length) + val;
            }

            buf += 'B' + int32BE(str.length + 6) + str + ZZ + DEHSComande;
        }

        this._queue.push(cb);

        if (this.ready === true) {
            this.write(buf);
        } else {
            this._writeBuf.push(buf);
        }
    }
    onData(buf) {
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
    }
    A() {
        let [type, v] = this._buf.utf8Slice(9, this._len).split(Z);

        if (v === '') {
            this.notifiy(type);
        } else {
            try {
                v = JSON.parse(v);
                this.notifiy(type, ...v);
            } catch (err) {
                this.notifiy(type, v);
            }
        }
    }
    R() {
        if (this._len === 12) {
            let str = postgresMd5PasswordHash(this._user, this._password, this._buf.slice(9));
            this.write('p' + int32BE(str.length + 4) + str);
        } else if (this._len === 8 && this._buf.readInt32LE(5) === 0) {
            this.ready = true;
            this._writeBuf.forEach(this.write.bind(this));
            delete this._writeBuf;
        }
    }
    S() {
        let m = this._buf.utf8Slice(5, this._len).split(Z);
        this.info[m[0]] = m[1];
    }
    K() {
        this.info['PID'] = this._buf.readInt32LE(4);
        this.info['PID_KEY'] = this._buf.readInt32LE(8);
    }
    C() {
        let cb = this._queue.shift();

        if (typeof cb !== 'function') {
            return;
        }

        this._res.rowCount = +this._buf.utf8Slice(5, this._len).split(' ').pop();
        cb(null, this._res);
        this._res = [];
    }
    T() {
        if (typeof this._queue.first !== 'function') {
            return;
        }

        let buf = this._buf;
        let n = buf.readInt16BE(5);
        let index, name, i, offset = 7;

        for (i = 0; i < n; ++i) {
            index = offset;
            while (buf[index++] !== 0);

            if (this._rowToJSON === true) {
                name = buf.utf8Slice(offset, index - 1);
            } else {
                name = i;
            }

            this._fields[i] = [name, this.pgType[buf.readInt32BE(index + 6)]];
            offset = index + 18;
        }
    }
    D() {
        if (typeof this._queue.first !== 'function') {
            return;
        }

        let buf = this._buf;
        let n = buf.readInt16BE(5);
        let len, row, name, f, i, offset = 7;

        if (this._rowToJSON === true) {
            row = {};
        } else {
            row = new Array(n);
        }

        for (i = 0; i < n; ++i) {
            [name, f] = this._fields[i];
            len = buf.readInt32BE(offset);
            offset += 4;
            if (len === -1) {
                row[name] = null;
            } else {
                if (f === undefined) {
                    row[name] = buf.utf8Slice(offset, offset += len);
                } else {
                    row[name] = f(buf.utf8Slice(offset, offset += len));
                }
            }
        }

        this._res.push(row);
    }
    E() {
        let cb = this._queue.shift();
        if (typeof cb === 'function') {
            cb(this._buf.utf8Slice(6, this._len));
        }
    }
}

module.exports = Connection;