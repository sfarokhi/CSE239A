const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const { Etcd3 } = require("etcd3");

class BST {
  constructor() {
    this.timestamps = new Map();
    this.realObjects = new Set();
    this.dummyObjects = new Set();
  }

  setTimestamp(key, ts) {
    this.timestamps.set(key, ts);
  }

  getTimestamp(key) {
    return this.timestamps.get(key) || 0;
  }

  getMinTimestampObj(type) {
    const objects = type === 'dummy' ? this.dummyObjects : this.realObjects;
    let minTs = Infinity;
    let minKey = null;
    
    for (const key of objects) {
      const ts = this.getTimestamp(key);
      if (ts < minTs) {
        minTs = ts;
        minKey = key;
      }
    }
    return minKey;
  }

  addObject(key, isDummy) {
    if (isDummy) {
      this.dummyObjects.add(key);
    } else {
      this.realObjects.add(key);
    }
  }
}

class Cache {
  constructor(size) {
    this.size = size;
    this.cache = new Map();
  }

  evict() {
    if (this.cache.size === 0) return [null, null];
    const [key] = this.cache.keys();
    const value = this.cache.get(key);
    this.cache.delete(key);
    return [key, value];
  }

  set(key, value) {
    if (this.cache.size >= this.size) {
      this.evict();
    }
    this.cache.set(key, value);
  }

  get(key) {
    return this.cache.get(key);
  }

  has(key) {
    return this.cache.has(key);
  }
}

const BATCH_SIZE = 10;
const FAKE_DUMMY_COUNT = 3;
const bst = new BST();
const cache = new Cache(100);
let timestamp = 0;

function getIndex(key, ts) {
  return crypto.createHash('sha256').update(`${key}:${ts}`).digest('hex');
}

function objectIsReal(key) {
  return bst.realObjects.has(key);
}

async function handleRequests(requests, etcd) {
  const cliResp = {};
  const dedupReqs = new Map();
  timestamp++;

  // Process incoming requests
  for (const { rid, op, key, val } of requests) {
    if (op === 'read' && cache.has(key)) {
      cliResp[rid] = cache.get(key);
    } else {
      if (!dedupReqs.has(key)) {
        dedupReqs.set(key, []);
      }
      dedupReqs.get(key).push({ rid, need_resp: op === 'read' });
    }

    if (op === 'write') {
      if (!cache.has(key)) {
        dedupReqs.get(key).push({ rid, need_resp: false });
      }
      cache.set(key, val);
      cliResp[rid] = val;
    }
    
    bst.addObject(key, false);
  }

  // Prepare read batch
  const readBatch = new Map();
  for (const [key] of dedupReqs) {
    const idx = getIndex(key, timestamp);
    readBatch.set(idx, key);
    bst.setTimestamp(key, timestamp);
  }

  // Add dummy queries
  for (let i = 0; i < FAKE_DUMMY_COUNT; i++) {
    const dummyKey = bst.getMinTimestampObj('dummy');
    if (dummyKey) {
      const idx = getIndex(dummyKey, timestamp);
      readBatch.set(idx, dummyKey);
      bst.setTimestamp(dummyKey, timestamp);
    }
  }

  // Add padding with real objects
  const remainingSlots = BATCH_SIZE - (readBatch.size + FAKE_DUMMY_COUNT);
  for (let i = 0; i < remainingSlots; i++) {
    const realKey = bst.getMinTimestampObj('real');
    if (realKey && !cache.has(realKey)) {
      const idx = getIndex(realKey, timestamp);
      readBatch.set(idx, realKey);
      bst.setTimestamp(realKey, timestamp);
    }
  }

  // Fetch from server
  const responses = await Promise.all(
    Array.from(readBatch.entries()).map(async ([idx, key]) => {
      const val = await etcd.get(key).string();
      return { idx, val };
    })
  );

  // Process responses
  const writeBatch = new Map();
  for (const { idx, val } of responses) {
    const key = readBatch.get(idx);
    
    if (dedupReqs.has(key)) {
      for (const { rid, need_resp } of dedupReqs.get(key)) {
        if (need_resp) {
          cliResp[rid] = val;
        }
      }

      if (objectIsReal(key)) {
        const [evictedKey, evictedVal] = cache.evict();
        if (evictedKey) {
          writeBatch.set(getIndex(evictedKey, timestamp), evictedVal);
        }
        cache.set(key, val);
      }
    } else {
      writeBatch.set(getIndex(key, timestamp), null);
    }
  }

  // Write batch to server
  await Promise.all(
    Array.from(writeBatch.entries()).map(([idx, val]) =>
      etcd.put(idx).value(val || '')
    )
  );

  return cliResp;
}

const app = express();
app.use(bodyParser.json());

const etcd = new Etcd3({
  hosts: 'localhost:2379'
});

// Initialize dummy objects
for (let i = 0; i < 100; i++) {
  const dummyKey = `dummy_${i}`;
  bst.addObject(dummyKey, true);
}

app.post("/", async (req, res) => {
  const responses = await handleRequests([req.body], etcd);
  res.json(responses);
});

app.listen(5000, () => console.log("Waffle-style proxy running on port 5000"));