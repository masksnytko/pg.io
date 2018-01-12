'use strict';

const parseBool = function (value) {
    return value === 'TRUE' ||
        value === 't' ||
        value === 'true' ||
        value === 'y' ||
        value === 'yes' ||
        value === 'on' ||
        value === '1';
}
const parseIntArray = function (value) {
    return JSON.parse(value
        .replace(/{/g, '[')
        .replace(/}/g, ']')
        .replace(/NULL/g, 'null'));
}
const parseBoolArray = function (value) {
    return JSON.parse(value
        .replace(/{/g, '[')
        .replace(/}/g, ']')
        .replace(/TRUE|t|y|yes|on|1]/g, 'true')
        .replace(/FALSE|f|n|no|off|0]/g, 'false')
        .replace(/NULL/g, 'null'));
}
const parseFloatArray = function (value) {
    return JSON.parse(value
        .replace(/{/g, '[')
        .replace(/}/g, ']')
        .replace(/NULL/g, 'null'));
}
const parseStringArray = function (value) {
    return value;
}
const parseByteArray = function (value) {
    return value;
}
const parseDateArray = function (value) {
    return value;
}
const parseDate = function (value) {
    return value;
}
const parsePoint = function (value) {
    return value;
}
const parsePointArray = function (value) {
    return value;
}
const parseCircle = function (value) {
    return value;
}
const parseByte = function (value) {
    return value;
}
const parseInterval = function (value) {
    return value;
}
const parseJsonArray = function (value) {
    return value;
}

class PostgresType extends Array {
    constructor() {
        super(3907);

        this[21] = parseInt; // int2
        this[23] = parseInt; // int4
        this[26] = parseInt; // oid
        this[20] = parseInt; // int8

        this[1005] = parseIntArray; // int2[]
        this[1007] = parseIntArray; // int4[]
        this[1016] = parseIntArray; // int8[]
        this[1028] = parseIntArray; // oid[]

        this[700] = parseFloat; // float4/real
        this[701] = parseFloat; // float8/double
        this[1700] = parseFloat; // float

        this[1021] = parseFloatArray; // float4[]
        this[1022] = parseFloatArray; // float8[]
        this[1231] = parseFloatArray; // numeric[]

        this[16] = parseBool;
        this[1000] = parseBoolArray;

        // this[17] = parseByte;
        // this[1001] = parseByteArray;

        // this[1082] = parseDate; // date
        // this[1114] = parseDate; // timestamp without timezone
        // this[1184] = parseDate; // timestamp

        // this[1115] = parseDateArray; // timestamp without time zone[]
        // this[1182] = parseDateArray; // _date
        // this[1185] = parseDateArray; // timestamp with time zone[]

        // this[600] = parsePoint; // point
        // this[1017] = parsePointArray; // point[]

        // this[718] = parseCircle; // circle
        // this[1186] = parseInterval;

        // this[199] = parseJsonArray; // json[]
        // this[3807] = parseJsonArray; // jsonb[]

        // this[114] = JSON.parse.bind(JSON); // json
        // this[3802] = JSON.parse.bind(JSON); // jsonb

        // this[791] = parseStringArray; // money[]
        // this[651] = parseStringArray; // cidr[]
        // this[1014] = parseStringArray; //char
        // this[1015] = parseStringArray; //varchar
        // this[1008] = parseStringArray;
        // this[1009] = parseStringArray;
        // this[1040] = parseStringArray; // macaddr[]
        // this[1041] = parseStringArray; // inet[]
        // this[3907] = parseStringArray; // numrange[]
        // this[2951] = parseStringArray; // uuid[]
        // this[1183] = parseStringArray; // time[]
        // this[1270] = parseStringArray; // timetz[]
    }
}

module.exports = PostgresType;