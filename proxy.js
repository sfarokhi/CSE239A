const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const fs = require("fs");
const { Etcd3 } = require("etcd3");

// LRU Cache implementation
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }

  getAll() {
    return Array.from(this.cache.entries());
  }
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default_32_byte_secure_key";
const CACHE_SIZE = 100;

const cache = new LRUCache(CACHE_SIZE);

function encryptKey(key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(key, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decryptKey(encKey) {
  const [ivHex, encrypted] = encKey.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

const etcd = new Etcd3({
  hosts: "https://localhost:2379",
  credentials: {
    rootCertificate: fs.readFileSync("ca.pem"),
    privateKey: fs.readFileSync("client-key.pem"),
    certChain: fs.readFileSync("client.pem"),
  },
});

// FIX so that it calls from dummy BST, NOT random
function generateDummyRequests(numDummyRequests) {
  const dummies = {};
  for (let i = 0; i < numDummyRequests; i++) {
    const dummyKey = `dummy_${crypto.randomBytes(8).toString('hex')}`;
    dummies[encryptKey(dummyKey)] = crypto.randomBytes(16).toString('hex');
  }
  return dummies;
}

async function processBatchWithCache(realRequests) {
  
  // Process responses and update cache
  const cliResp = {};
  const dedupReqs = {}

  // Check cache first
  for (const [key, reqs] of Object.entries(realRequests)) {
    const encKey = encryptKey(key);
    const cachedValue = cache.get(encKey);
    
    if (cachedValue) {
      cacheHits[key] = { value: cachedValue, requests: reqs };
    } else {
      needsFetch[encKey] = { key, requests: reqs };
      dedupReqs[encKey] = null;
    }
  }

  // // Fetch missing values from etcd
  // const responses = await Promise.all(
  //   Object.keys(dedupReqs).map(async (encKey) => {
  //     const value = await etcd.get(encKey).string();
  //     return { encKey, value };
  //   })
  // );

  // Handle cache hits
  Object.entries(cacheHits).forEach(([key, { value, requests }]) => {
    requests.forEach(({ rid, need_resp }) => {
      if (need_resp) cliResp[rid] = value;
    });
  });

  // Handle fetched values
  responses.forEach(({ encKey, value }) => {
    if (needsFetch[encKey]) {
      const { key, requests } = needsFetch[encKey];
      if (value) {
        cache.put(encKey, value);
        requests.forEach(({ rid, need_resp }) => {
          if (need_resp) cliResp[rid] = value;
        });
      }
    }
  });

  return cliResp;
}

const app = express();
app.use(bodyParser.json());

app.post("/", async (req, res) => {
  const { rid, op, key, val } = req.body;
  const dedupReqs = {};

  if (op === "read") {
    dedupReqs[key] = [{ rid, need_resp: true }];
    const responses = await processBatchWithCache(dedupReqs);
    res.json(responses);
  } else if (op === "write") {
    const encKey = encryptKey(key);
    await etcd.put(encKey).value(val);
    cache.put(encKey, val);
    res.json({ [rid]: val });
  }
});

app.listen(5000, () => {
  console.log("Secure Proxy server running on port 5000");
});