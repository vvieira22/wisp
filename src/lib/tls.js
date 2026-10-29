"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// ponytail: certificates are generated with a tiny DER encoder instead of
// shelling out to openssl, so a packaged Wisp works on any machine with no
// extra install. If the format below ever needs more X.509 features, swap this
// for a vetted pure-JS generator rather than growing it unbounded.
const CA_CN = "Wisp Local CA";
const LEAF_CN = "Wisp Mobile";
const META_VERSION = "js1";

function derLength(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  let value = n;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag, content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

function seq(...items) {
  return tlv(0x30, Buffer.concat(items));
}

function set(...items) {
  return tlv(0x31, Buffer.concat(items));
}

function integer(value) {
  let buf = Buffer.isBuffer(value) ? Buffer.from(value) : null;
  if (!buf) {
    let hex = BigInt(value).toString(16);
    if (hex.length % 2) hex = "0" + hex;
    buf = Buffer.from(hex, "hex");
  }
  if (!buf.length) buf = Buffer.from([0]);
  if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]);
  return tlv(0x02, buf);
}

function bool(value) {
  return tlv(0x01, Buffer.from([value ? 0xff : 0x00]));
}

function octetString(content) {
  return tlv(0x04, content);
}

function bitString(content, unusedBits = 0) {
  return tlv(0x03, Buffer.concat([Buffer.from([unusedBits]), content]));
}

function utf8String(value) {
  return tlv(0x0c, Buffer.from(String(value), "utf8"));
}

function utcTime(date) {
  const iso = date.toISOString();
  const stamp = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return tlv(0x17, Buffer.from(stamp, "ascii"));
}

function oid(value) {
  const parts = String(value).split(".").map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    const stack = [];
    let arc = parts[i];
    do {
      stack.unshift(arc & 0x7f);
      arc = Math.floor(arc / 128);
    } while (arc > 0);
    for (let j = 0; j < stack.length; j++) {
      bytes.push(stack[j] | (j < stack.length - 1 ? 0x80 : 0));
    }
  }
  return tlv(0x06, Buffer.from(bytes));
}

function explicit(tagNumber, content) {
  return tlv(0xa0 + tagNumber, content);
}

function name(commonName) {
  return seq(set(seq(oid("2.5.4.3"), utf8String(commonName))));
}

function generalIp(ip) {
  return tlv(0x87, Buffer.from(ip.split(".").map(Number)));
}

function generalDns(host) {
  return tlv(0x82, Buffer.from(host, "ascii"));
}

function extension(id, critical, valueDer) {
  return seq(oid(id), ...(critical ? [bool(true)] : []), octetString(valueDer));
}

function sha256WithRsa() {
  return seq(oid("1.2.840.113549.1.1.11"), tlv(0x05, Buffer.alloc(0)));
}

function pem(label, der) {
  const body = der.toString("base64").replace(/(.{64})/g, "$1\n").replace(/\n$/, "");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

function randomSerial() {
  const buf = crypto.randomBytes(16);
  buf[0] &= 0x7f;
  if (!buf.some((byte) => byte !== 0)) buf[15] = 1;
  return buf;
}

function tbsCertificate({ serial, issuer, subject, notBefore, notAfter, spkiDer, extensions }) {
  return seq(
    explicit(0, integer(2)),
    integer(serial),
    sha256WithRsa(),
    issuer,
    seq(utcTime(notBefore), utcTime(notAfter)),
    subject,
    spkiDer,
    explicit(3, seq(...extensions)),
  );
}

function buildCertificate(tbsDer, privateKey) {
  const signature = crypto.sign("sha256", tbsDer, privateKey);
  return pem("CERTIFICATE", seq(tbsDer, sha256WithRsa(), bitString(signature)));
}

function caExtensions() {
  return [
    extension("2.5.29.19", true, seq(bool(true))),
    extension("2.5.29.15", true, bitString(Buffer.from([0x06]), 1)),
  ];
}

function leafExtensions(ips) {
  const names = [generalIp("127.0.0.1"), generalDns("localhost")];
  for (const ip of ips) {
    if (ip !== "127.0.0.1") names.push(generalIp(ip));
  }
  return [
    extension("2.5.29.19", true, seq()),
    extension("2.5.29.15", true, bitString(Buffer.from([0xa0]), 5)),
    extension("2.5.29.37", false, seq(oid("1.3.6.1.5.5.7.3.1"))),
    extension("2.5.29.17", false, seq(...names)),
  ];
}

function sanitizeIps(list) {
  const out = ["127.0.0.1"];
  for (const raw of Array.isArray(list) ? list : []) {
    const ip = String(raw || "").trim();
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) continue;
    if (!out.includes(ip)) out.push(ip);
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function sameIps(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((ip, i) => ip === b[i]);
}

function generateCa(notBefore, notAfter) {
  const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const subject = name(CA_CN);
  const tbs = tbsCertificate({
    serial: randomSerial(),
    issuer: subject,
    subject,
    notBefore,
    notAfter,
    spkiDer: keys.publicKey.export({ type: "spki", format: "der" }),
    extensions: caExtensions(),
  });
  return {
    keyPem: keys.privateKey.export({ type: "pkcs8", format: "pem" }),
    certPem: buildCertificate(tbs, keys.privateKey),
    privateKey: keys.privateKey,
  };
}

function ensureTls(certDir, ips) {
  const dir = path.resolve(certDir);
  const caKeyFile = path.join(dir, "wisp-ca.key");
  const caCrtFile = path.join(dir, "wisp-ca.crt");
  const serverKeyFile = path.join(dir, "server.key");
  const serverCrtFile = path.join(dir, "server.crt");
  const metaFile = path.join(dir, "server.json");
  const wanted = sanitizeIps(ips);

  try {
    fs.mkdirSync(dir, { recursive: true });
    const meta = readJson(metaFile);
    let ca = null;
    if (meta && meta.gen === META_VERSION && fs.existsSync(caKeyFile) && fs.existsSync(caCrtFile)) {
      try {
        const parsedCa = new crypto.X509Certificate(fs.readFileSync(caCrtFile, "utf8"));
        const keyPem = fs.readFileSync(caKeyFile, "utf8");
        if (!parsedCa.ca) throw new Error("stored certificate is not a CA");
        if (!parsedCa.checkPrivateKey(crypto.createPrivateKey(keyPem))) {
          throw new Error("stored CA key does not match the certificate");
        }
        ca = { keyPem, certPem: parsedCa.toString() };
      } catch {
        ca = null;
      }
    }

    const now = new Date();
    const notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let caRegenerated = false;
    if (!ca) {
      const generated = generateCa(notBefore, new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000));
      ca = generated;
      caRegenerated = true;
      fs.writeFileSync(caKeyFile, ca.keyPem);
      fs.writeFileSync(caCrtFile, ca.certPem);
    }
    const caKey = crypto.createPrivateKey(ca.keyPem);

    const serverMeta = readJson(metaFile);
    const needsLeaf =
      caRegenerated ||
      !serverMeta ||
      serverMeta.gen !== META_VERSION ||
      !fs.existsSync(serverKeyFile) ||
      !fs.existsSync(serverCrtFile) ||
      !sameIps(serverMeta.ips, wanted);
    if (needsLeaf) {
      const leafKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
      const tbs = tbsCertificate({
        serial: randomSerial(),
        issuer: name(CA_CN),
        subject: name(LEAF_CN),
        notBefore,
        notAfter: new Date(now.getTime() + 825 * 24 * 60 * 60 * 1000),
        spkiDer: leafKeys.publicKey.export({ type: "spki", format: "der" }),
        extensions: leafExtensions(wanted),
      });
      fs.writeFileSync(serverKeyFile, leafKeys.privateKey.export({ type: "pkcs8", format: "pem" }));
      fs.writeFileSync(serverCrtFile, buildCertificate(tbs, caKey));
      fs.writeFileSync(metaFile, JSON.stringify({ gen: META_VERSION, ips: wanted, at: Date.now() }, null, 2));
    }

    try {
      if (process.platform !== "win32") {
        fs.chmodSync(caKeyFile, 0o600);
        fs.chmodSync(serverKeyFile, 0o600);
      }
    } catch {}

    return {
      ok: true,
      key: fs.readFileSync(serverKeyFile, "utf8"),
      cert: fs.readFileSync(serverCrtFile, "utf8"),
      caPem: fs.readFileSync(caCrtFile, "utf8"),
      caPath: caCrtFile,
      ips: wanted,
    };
  } catch (err) {
    return { ok: false, error: (err && err.message) || "Falha ao gerar o certificado HTTPS." };
  }
}

const tlsApi = { ensureTls };
if (typeof module === "object" && module.exports) module.exports = tlsApi;
if (typeof document === "object") Object.assign(globalThis, tlsApi);
