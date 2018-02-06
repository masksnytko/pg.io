# pg.io
Speed driver node js for PostgreSQL (100 000 request/sec and more), LISTEN, NOTIFY, pool, castom Types, minimal dependencies

# Install

npm i pg.io

# Сonnect

Сonnection is not explicit, you do not need to worry about it, you can immediately send requests

```js
const PG = require('pg.io');

const DB = new PG({
    user: 'username',
    password: 'password',
    database: 'database',
    rowFormat: 'JSON',
    max: 6
});
```
`rowFormat: 'JSON'` if you want the result of a string in JSON  `res = [{...},{...}...]`

`max: 6` The number of simultaneous connections to the database, balancing is based on the Round Robin principle. Specifying more than physical cores does not make sense. In my experience, half of the number of cores is the ideal option for one thread node

# Query

```js
DB.query('SELECT 1', (err, res) => {
  console.log(err, res);
});

let res = await DB.query('SELECT 1');

DB.query('SELECT $1', 1, (err, res) => {
  console.log(err, res);
});

DB.query('SELECT $1::INT, $2::TEXT', 1, 'param', (err, res) => {
  console.log(err, res);
});

let res = await DB.query('SELECT $1::INT, $2::TEXT', 1, 'param');
```

# LISTEN, NOTIFY

```js
DB.on('Users.update', (id, name) => {
  console.log(id, name);
});
```

`DB.on` return Promise (this is necessary in case of waiting for the hanging of the device)

```js
await DB.on('Users.update', (id, name) => {
  console.log(id, name); //1, 'user';
});

DB.emit('Users.update', 1, 'user');
```

These methods can be run on different machines or in different threads

`DB.emit` this is the same as `SELECT pg_notify("Users.update", '[1, "user"]');` or `NOTIFY "Users.update", '[1, "user"]'`

will only work once
```js
DB.once('Users.update', (id, name) => {
  console.log(id, name);
});
```

# Custom types
You can determine how to convert a given specific type

114 - code JSON
3802 - code JSONb

```sql
select typname, typelem, typarray from pg_type; --return all code pg_type
```

```js
DB.setType(114, JSON.parse);
let res = await DB.query('SELECT $1::JSON', JSON.stringify({name: 'maksim snytko'}));
console.log(res);//[ { json: { name: 'maksim snytko' } } ]

DB.setType(1184, str => {
    return 'Minsk UNIX '+Date.parse(str);
});
let res = await DB.query('SELECT now()');
console.log(res);//[{ now: 'Minsk UNIX 1513101706805'}]
```

# Benchmark

PostgreSQL = 10

CPU = i7-6700HQ

OS = Windows 10

Node = 9.50

```js
const PG = require('pg.io');

const DB = new PG({
    user: 'postgres',
    password: 'password',
    database: 'postgres',
    max: 6
});

var k = 0;
console.time('test');
for (var i = 0; i < 1000000; i++) {
    DB.query('SELECT 1', () => {
        if (++k === 1000000) {
            console.timeEnd('test');
        }
    });
}
```

test: 7618.609ms ~ 130 000 i/o sec
