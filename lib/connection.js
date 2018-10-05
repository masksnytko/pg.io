const { Stream } = require('net');
const crypto = require('crypto');
const Queue = require('queue.o');

const SFCC = String.fromCharCode;
const ZZZZ = SFCC(0, 0, 0, 0);
const ZZZ = SFCC(0, 0, 0);
const ZZ = SFCC(0, 0);
const Z = SFCC(0);

function md5(str) {
    return crypto.createHash('md5').update(str, 'utf-8').digest('hex');
}
function postgresMd5PasswordHash(md5PasswordUser, salt) {
    return 'md5' + md5(Buffer.concat([Buffer.from(md5PasswordUser), salt]));
}
function int32BE(n) {
    return SFCC(n >>> 24, n >>> 16, n >>> 8, n >>> 0);
}
const DEHSComande = 'D' + int32BE(6) + 'P' + Z + 'E' + int32BE(9) + Z + int32BE(0) + 'H' + int32BE(4) + 'S' + int32BE(4);
const ALLOC_SIZE_BUFFER = 128;

class Connection extends Stream {
    constructor(options, notifiy, pgType) {
        super();

        this.database = options.database || 'postgres';
        this.host = options.host || 'localhost';
        this.user = options.user || 'postgres';
        this.port = options.port || 5432;

        this.md5PasswordUser = md5(options.password + this.user);
        this.wBuf = Buffer.allocUnsafe(ALLOC_SIZE_BUFFER);
        this.rowToJSON = options.rowFormat === 'JSON';
        this.notifiy = notifiy;
        this.pgType = pgType;

        this.on('connect', () => {
            let str = 'user' + Z + this.user + Z + 'database' + Z + this.database + Z + 'client_encoding' + Z + "'utf-8'" + ZZ;
            this.wInt32BE(Buffer.byteLength(str) + 8);
            this.wInt32BE(196608);
            this.wString(str);
            this.send();
        });

        this.on('ready', () => {
            this.stack.forEach(v => this.write(v));
            this.stack = [];
        });

        this.once('ready', () => {
            this.on('error', err => {
                this.ready = false;
                this.queue.forEach(cb => cb(err));
                setTimeout(() => {
                    this.pgConnect();
                }, 15000);
            });
        });

        this.on('data', buf => {
            if (this.rBuf.length === 0) {
                this.rBuf = buf;
            } else {
                this.rBuf = Buffer.concat([this.rBuf, buf]);
            }

            while (this.rBuf.length > 4) {
                this.len = this.rBuf.readInt32BE(1);
                if (this.len >= this.rBuf.length) {
                    break;
                }
                switch (this.rBuf[0]) {
                    case 65: this.A(); break;
                    case 67: this.C(); break;
                    case 68: this.D(); break;
                    case 69: this.E(); break;
                    case 75: this.K(); break;
                    case 82: this.R(); break;
                    case 83: this.S(); break;
                    case 84: this.T(); break;
                }
                this.rBuf = this.rBuf.slice(this.len + 1);
            }
        });

        this.pgConnect();
    }
    init() {
        this.rBuf = Buffer.alloc(0);
        this.queue = new Queue;
        this.ready = false;
        this.offset = 0;
        this.fields = [];
        this.stack = [];
        this.info = {};
        this.res = [];
    }
    pgConnect() {
        this.init();
        this.connect(this.port, this.host);
    }
    wString(str) {
        let len = Buffer.byteLength(str);
        this.ensure(len);
        this.wBuf.utf8Write(str, this.offset, len);
        this.offset += len;
    }
    wInt32BE(n) {
        this.ensure(4);
        this.wBuf[this.offset++] = (n >>> 24 & 0xFF);
        this.wBuf[this.offset++] = (n >>> 16 & 0xFF);
        this.wBuf[this.offset++] = (n >>> 8 & 0xFF);
        this.wBuf[this.offset++] = (n >>> 0 & 0xFF);
    }
    wInt16BE(n) {
        this.ensure(2);
        this.wBuf[this.offset++] = (n >>> 8 & 0xFF);
        this.wBuf[this.offset++] = (n >>> 0 & 0xFF);
    }
    ensure(size) {
        if (this.wBuf.length - this.offset < size) {
            let oldBuff = this.wBuf;
            let len = oldBuff.length;
            this.wBuf = Buffer.allocUnsafe(len + (len >> 1) + size);
            oldBuff.copy(this.wBuf);
        }
    }
    send() {
        this.write(this.wBuf.slice(0, this.offset));
        this.offset = 0;
    }
    save() {
        this.stack.push(this.wBuf.slice(0, this.offset));
        this.wBuf = Buffer.allocUnsafe(ALLOC_SIZE_BUFFER);
        this.offset = 0;
    }
    query(str, ...arg) {
        let promise;
        if (typeof arg[arg.length - 1] === 'function') {
            this.queue.push(arg.pop());
        } else {
            promise = new Promise((resolve, reject) => {
                this.queue.push((err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                });
            });
        }

        if (arg.length === 0) {
            this.wString('Q');
            this.wInt32BE(Buffer.byteLength(str) + 5);
            this.wString(str + Z);
        } else {
            this.wString('P');
            this.wInt32BE(Buffer.byteLength(str) + 8);
            this.wString(Z + str + ZZZ + 'B');

            //true len write after for;
            let oldOffset = this.offset;
            this.ensure(4);
            this.offset += 4;

            this.wString(ZZZZ);
            this.wInt16BE(arg.length);
            for (var i = 0, val; i < arg.length; i++) {
                val = String(arg[i]);
                if (val === 'null') {
                    this.wInt32BE(-1);
                } else {
                    this.wInt32BE(Buffer.byteLength(val));
                    this.wString(val);
                }
            }
            //write true len
            this.wBuf.writeInt32BE(this.offset - oldOffset + 2, oldOffset, true);
            this.wString(ZZ + DEHSComande);
        }

        if (this.ready === true) {
            this.send();
        } else {
            this.save();
        }

        return promise;
    }
    A() {
        let [type, v] = this.rBuf.utf8Slice(9, this.len).split(Z, 2);

        if (v === '') {
            this.notifiy(type);
        } else {
            try {
                v = JSON.parse(v);
            } catch (err) { }

            if (v instanceof Array) {
                this.notifiy(type, ...v);
            } else {
                this.notifiy(type, v);
            }
        }
    }
    R() {
        if (this.len === 12) {
            let str = postgresMd5PasswordHash(this.md5PasswordUser, this.rBuf.slice(9));
            this.wString('p');
            this.wInt32BE(str.length + 5);
            this.wString(str + Z);
            this.send();
        } else if (this.len === 8 && this.rBuf.readInt32LE(5) === 0) {
            this.ready = true;
            this.emit('ready');
        }
    }
    S() {
        let m = this.rBuf.utf8Slice(5, this.len).split(Z);
        this.info[m[0]] = m[1];
    }
    K() {
        this.info['PID'] = this.rBuf.readInt32LE(4);
        this.info['PID_KEY'] = this.rBuf.readInt32LE(8);
    }
    C() {
        this.res.rowCount = +this.rBuf.utf8Slice(5, this.len).split(' ').pop();
        this.queue.shift()(null, this.res);
        this.res = [];
    }
    T() {
        let buf = this.rBuf;
        let n = buf.readInt16BE(5);
        let index, name, i, offset = 7;

        for (i = 0; i < n; ++i) {
            index = offset;
            while (buf[index++] !== 0);

            if (this.rowToJSON === true) {
                name = buf.utf8Slice(offset, index - 1);
            } else {
                name = i;
            }

            this.fields[i] = [name, this.pgType[buf.readInt32BE(index + 6)]];
            offset = index + 18;
        }
    }
    D() {
        let buf = this.rBuf;
        let n = buf.readInt16BE(5);
        let row, name, f, i, len, offset = 7;

        if (this.rowToJSON === true) {
            row = {};
        } else {
            row = new Array(n);
        }

        for (i = 0; i < n; i++) {
            [name, f] = this.fields[i];
            len = buf.readInt32BE(offset);
            offset += 4;

            if (len === -1) {
                row[name] = null;
            } else if (f === undefined) {
                row[name] = buf.utf8Slice(offset, offset += len);
            } else {
                row[name] = f(buf.utf8Slice(offset, offset += len));
            }
        }

        this.res.push(row);
    }
    E() {
        this.queue.shift()(this.rBuf.utf8Slice(6, this.len));
    }
}

module.exports = Connection;