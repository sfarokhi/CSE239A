const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const fs = require("fs");
const { AbortController } = require('abort-controller');
const { Etcd3 } = require("etcd3");

class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  has(key) {
    return this.cache.has(key);
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    // this.cache.delete(key);
    // this.cache.set(key, value);
    return value;
  }

  set(key, value) {

    if (this.cache.size >= this.capacity) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
  }

  evict() {
    if (this.cache.size === 0) return [null, null];
    const key = this.cache.keys().next().value;
    const value = this.cache.get(key);
    this.cache.delete(key);
    return [key, value];
  }
}

class MinHeap {
  constructor() {
      this.heap = [];
  }

  getParentIndex(index) {
      return Math.floor((index - 1) / 2);
  }

  getLeftChildIndex(index) {
      return 2 * index + 1;
  }

  getRightChildIndex(index) {
      return 2 * index + 2;
  }

  swap(i, j) {
      [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
  }

  insert(timestamp, key) {
    const dupIndex = !this.heap.findIndex((obj) => obj.key === key); 
    if (!dupIndex) {
      this.heap.push({ timestamp, key });
      this.heapifyUp();
    }
  }

  heapifyUp() {
      let index = this.heap.length - 1;
      while (index > 0) {
          let parentIndex = this.getParentIndex(index);
          if (this.heap[index].timestamp < this.heap[parentIndex].timestamp) {
              this.swap(index, parentIndex);
              index = parentIndex;
          } else {
              break;
          }
      }
  }

  popMin() {
      if (this.heap.length === 0) return null;
      if (this.heap.length === 1) return this.heap.pop();

      const min = this.heap[0];
      this.heap[0] = this.heap.pop();
      this.heapifyDown();
      return min;
  }

  heapifyDown() {
      let index = 0;
      let length = this.heap.length;

      while (true) {
          let leftChildIndex = this.getLeftChildIndex(index);
          let rightChildIndex = this.getRightChildIndex(index);
          let smallest = index;

          if (leftChildIndex < length && this.heap[leftChildIndex].timestamp < this.heap[smallest].timestamp) {
              smallest = leftChildIndex;
          }
          if (rightChildIndex < length && this.heap[rightChildIndex].timestamp < this.heap[smallest].timestamp) {
              smallest = rightChildIndex;
          }

          if (smallest !== index) {
              this.swap(index, smallest);
              index = smallest;
          } else {
              break;
          }
      }
  }

  peek() {
      console.log('Heap:', this.heap);
      return this.heap.length > 0 ? this.heap[0] : null;
  }

  isEmpty() {
      return this.heap.length === 0;
  }
}

class BSTHeap {
  constructor() {
      this.timestamps = new Map();
      this.realObjects = new MinHeap();
      this.dummyObjects = new MinHeap();
  }

  setTimestamp(key, ts, isDummy) {
    this.timestamps.set(key, ts);
    if (isDummy === 'dummy') {
      this.dummyObjects.insert(ts, key);
    } else {
      this.realObjects.insert(ts, key);
    }
  }

  getTimestamp(key) {
      return this.timestamps.get(key) || 0;
  }

  popMin(isDummy) {
      if (isDummy === 'dummy') {
          return this.dummyObjects.popMin().key || null;
      } else {
          return this.realObjects.popMin().key || null;
      }
  }

  addObject(key, isDummy) {
    const ts = this.getTimestamp(key);
    if (isDummy === 'dummy') {
        this.dummyObjects.insert(ts, key);
    } else {
        this.realObjects.insert(ts, key);
    }
  }
}

// Define the bounds of the proxy
// B -> BATCH_SIZE
// fD -> FAKE_DUMMY_COUNT
const CACHE_SIZE = 20;
const BATCH_SIZE = 20;
const FAKE_DUMMY_COUNT = 10;

const cache = new LRUCache(CACHE_SIZE);
const bst = new BSTHeap();
let timestamp = 0;

function objectIsReal(key) {
  return !key.startsWith('dummy_');
}

// Uses a PRF to encrypt the key, using the timestamp
function getIndex(key, ts) {
  return crypto.createHmac('sha256', key).update(ts.toString()).digest('hex');
}

async function fetchFromEtcd(key, controller) {
  try {
    return await etcd.get(key).string();
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error(`Error fetching key ${key}:`, error);
    }
    return null;
  }
}

async function handleRequests(requests, etcd) {
  const cliResp = {};
  const dedupReqs = new Map();
  timestamp++;

  try {

    if (!Array.isArray(requests)) {
      return cliResp;
    }

    // Process requests
    for (const { rid, op, key, val } of requests) {
      if (!key) continue;
      
      // Read request
      if (op === 'read') {

        if (cache.has(key)) {
          console.log('Cache Hit:', key);
          cliResp[rid] = cache.get(key);
          
        } else {
          if (!dedupReqs.has(key)) {
            dedupReqs.set(key, []);
          }
          dedupReqs.get(key).push({ rid, need_resp: op === 'read' });
        }

        bst.addObject(key, 'real');
      }

      if (op === 'write' && val !== undefined) {
        if (!cache.has(key)) {
          if (!dedupReqs.has(key)) {
            dedupReqs.set(key, []);
          }
          dedupReqs.get(key).push({ rid, need_resp: false });
        }
        cache.set(key, val);
        cliResp[rid] = val;
        bst.addObject(key, 'real');
      }
    }

    // Initialize the read batch, with dedup requests
    const readBatch = new Map();
    for (const [key] of dedupReqs) {
      const idx = getIndex(key, timestamp);
      readBatch.set(idx, key);
      bst.setTimestamp(key, timestamp, 'real');
      console.log('Added dedup key:', key);
    }

    // Fill the read batch with fake dummy queries
    for (let i = 0; i < FAKE_DUMMY_COUNT; i++) {
      const dummyKey = bst.popMin('dummy');
      if (dummyKey) {
        console.log('Dummy key:', dummyKey);
        console.log('Dummy key timestamp:', bst.getTimestamp(dummyKey));

        const idx = getIndex(dummyKey, timestamp);
        readBatch.set(idx, dummyKey);
        bst.setTimestamp(dummyKey, timestamp, 'dummy');
        console.log('Added dummy key:', dummyKey);
      }
    }
    
    const remainingSlots = BATCH_SIZE - readBatch.size;
    for (let i = 0; i < remainingSlots; i++) {
      const realKey = bst.popMin('real');
      if (realKey && !cache.has(realKey)) {
        const idx = getIndex(realKey, timestamp);
        readBatch.set(idx, realKey);
        bst.setTimestamp(realKey, timestamp, 'real');
        console.log('Added real key:', realKey);
      } else {
        console.log('No more real objects to read');
        break;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    console.log('Dedup requests:', dedupReqs);
    console.log('Read batch:', readBatch);


    const responses = await Promise.all(
      Array.from(readBatch.entries()).map(async ([idx, key]) => {
        const val = await fetchFromEtcd(key, controller);
        return { idx, val };
      })
    );

    clearTimeout(timeout);

    const writeBatch = new Map();
    for (const { idx, val } of responses) {
      if (!val) continue;
      
      const key = readBatch.get(idx);
      if (!key) continue;
      
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

    await Promise.all(
      Array.from(writeBatch.entries()).map(([idx, val]) =>
        etcd.put(idx).value(val || '')
      )
    );

  } catch (error) {
    console.error('Error in handleRequests:', error);
  }

  return cliResp;
}

const app = express();
app.use(bodyParser.json());

const etcd = new Etcd3({
  hosts: "http://localhost:2378",
//   credentials: {
//     rootCertificate: fs.readFileSync("ca.pem"),
//     privateKey: fs.readFileSync("client-key.pem"),
//     certChain: fs.readFileSync("client.pem"),
//   },
});

// console.log(etcd.put("test", "foo"));
// console.log(etcd.get("test"));

// Initialize dummy objects
for (let i = 0; i < 100; i++) {
  const dummyKey = `dummy_${i}`;
  bst.addObject(dummyKey, 'dummy');
}

// console.log("Dummy objects initialized");
// console.log(bst.realObjects.heap);
// console.log(bst.dummyObjects.heap);

app.all("/", async (req, res) => {
  try {
    // console.log("Received request:", req);
    const responses = await handleRequests(req.body, etcd);
    res.json(responses);
  } catch (error) {
    console.error('Request handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(5000, () => console.log("Proxy running on port 5000"));