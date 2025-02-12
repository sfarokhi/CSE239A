const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const fs = require("fs");
const { AbortController } = require('abort-controller');
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
      this.heap.push({ timestamp, key });
      this.heapifyUp();
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

  setTimestamp(key, ts) {
      this.timestamps.set(key, ts);
      this.realObjects.insert(ts, key);
  }

  getTimestamp(key) {
      return this.timestamps.get(key) || 0;
  }

  getMinTimestampObj(type) {
      if (type === 'dummy') {
          return this.dummyObjects.peek().key || null;
      } else {
          return this.realObjects.peek().key || null;
      }
  }

  addObject(key, isDummy) {
      const ts = this.getTimestamp(key);
      if (isDummy) {
          this.dummyObjects.insert(ts, key);
      } else {
          this.realObjects.insert(ts, key);
      }
  }

  popMin(type) {
      if (type === 'dummy') {
          return this.dummyObjects.popMin().key || null;
      } else {
          return this.realObjects.popMin().key || null;
      }
  }
}

// Define the bounds of the proxy
// B -> BATCH_SIZE
// fD -> FAKE_DUMMY_COUNT
const CACHE_SIZE = 20;
const BATCH_SIZE = 20;
const FAKE_DUMMY_COUNT = 5;

const cache = new LRUCache(CACHE_SIZE);
const bst = new BSTHeap();
let timestamp = 0;

// Uses a PRF to encrypt the key, using the timestamp
function getIndex(key, ts) {
  return crypto.createHmac('sha256', key).update(ts).digest('hex');
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
    // Process requests
    for (const { rid, op, key, val } of requests) {
      if (!key) continue;
      
      if (op === 'read' && cache.has(key)) {
        cliResp[rid] = cache.get(key);
      } else {
        if (!dedupReqs.has(key)) {
          dedupReqs.set(key, []);
        }
        dedupReqs.get(key).push({ rid, need_resp: op === 'read' });
      }

      if (op === 'write' && val !== undefined) {
        if (!cache.has(key)) {
          dedupReqs.get(key).push({ rid, need_resp: false });
        }
        cache.set(key, val);
        cliResp[rid] = val;
      }
      
      bst.addObject(key, false);
    }

    const readBatch = new Map();
    for (const [key] of dedupReqs) {
      const idx = getIndex(key, timestamp);
      readBatch.set(idx, key);
      bst.setTimestamp(key, timestamp);
    }

    for (let i = 0; i < FAKE_DUMMY_COUNT; i++) {
      const dummyKey = bst.getMinTimestampObj('dummy');
      if (dummyKey) {
        const idx = getIndex(dummyKey, timestamp);
        readBatch.set(idx, dummyKey);
        bst.setTimestamp(dummyKey, timestamp);
      }
    }

    const remainingSlots = BATCH_SIZE - (readBatch.size + FAKE_DUMMY_COUNT);
    for (let i = 0; i < remainingSlots; i++) {
      const realKey = bst.getMinTimestampObj('real');
      if (realKey && !cache.has(realKey)) {
        const idx = getIndex(realKey, timestamp);
        readBatch.set(idx, realKey);
        bst.setTimestamp(realKey, timestamp);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

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
  hosts: "https://localhost:2379",
//   credentials: {
//     rootCertificate: fs.readFileSync("ca.pem"),
//     privateKey: fs.readFileSync("client-key.pem"),
//     certChain: fs.readFileSync("client.pem"),
//   },
});

// Initialize dummy objects
for (let i = 0; i < 100; i++) {
  const dummyKey = `dummy_${i}`;
  bst.addObject(dummyKey, true);
}

app.all("/", async (req, res) => {
  try {
    const responses = await handleRequests([req.body], etcd);
    res.json(responses);
  } catch (error) {
    console.error('Request handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(5000, () => console.log("Proxy running on port 5000"));