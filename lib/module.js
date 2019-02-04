const path = require('path');
const fs = require('fs');

class Module {
    constructor(db, _path, dir) {
        dir = dir || path.parse((new Error).stack.split(' (')[3].split(')')[0]).dir;
        dir = path.resolve(dir, _path);

        if (db.modules[dir]) {
            return db.modules[dir];
        } else {
            db.modules[dir] = this;
        }

        let list = fs.readdirSync(dir);
        for (var method of list) {
            var { ext, name } = path.parse(method);
            if (ext === '.pgsql' || ext === '.sql') {
                this[name] = db.query.bind(db, fs.readFileSync(path.join(dir, method)));
            } else if (fs.statSync(path.join(dir, method)).isDirectory()) {
                this[name] = new Module(db, name, dir);
            }
        }
    }
}

module.exports = Module;