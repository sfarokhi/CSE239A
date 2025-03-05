package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

const (
	BATCH_SIZE       = 50
	FAKE_DUMMY_COUNT = 25
	TOTAL_DUMMIES    = 100
)

// Request structure
type Request struct {
	RID string      `json:"rid"`
	Op  string      `json:"op"`
	Key string      `json:"key"`
	Val interface{} `json:"val"`
}

// Cache entry
type cacheEntry struct {
	value interface{}
	next  *cacheEntry
	prev  *cacheEntry
	key   string
}

// LRU Cache implementation
type LRUCache struct {
	capacity int
	cache    map[string]*cacheEntry
	head     *cacheEntry
	tail     *cacheEntry
	mutex    sync.Mutex
}

// Create new LRU cache
func NewLRUCache(capacity int) *LRUCache {
	return &LRUCache{
		capacity: capacity,
		cache:    make(map[string]*cacheEntry),
	}
}

// Get value from cache
func (c *LRUCache) Get(key string) (interface{}, bool) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	if entry, needsResponse := c.cache[key]; needsResponse {
		c.moveToHead(entry)
		return entry.value, true
	}
	return nil, false
}

// Put value in cache
func (c *LRUCache) Put(key string, value interface{}) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	if entry, needsResponse := c.cache[key]; needsResponse {
		entry.value = value
		c.moveToHead(entry)
		return
	}

	newEntry := &cacheEntry{
		value: value,
		key:   key,
	}

	c.cache[key] = newEntry

	if c.head == nil {
		c.head = newEntry
		c.tail = newEntry
	} else {
		newEntry.next = c.head
		c.head.prev = newEntry
		c.head = newEntry
	}

	if len(c.cache) > c.capacity {
		c.evict()
	}
}

// Has checks if key exists in cache
func (c *LRUCache) Has(key string) bool {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	_, needsResponse := c.cache[key]
	return needsResponse
}

// Evict removes oldest entry from cache
func (c *LRUCache) Evict() (string, interface{}) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	if c.tail == nil {
		return "", nil
	}

	return c.evict()
}

// Internal eviction
func (c *LRUCache) evict() (string, interface{}) {
	if c.tail == nil {
		return "", nil
	}

	evicted := c.tail
	key := evicted.key
	value := evicted.value

	delete(c.cache, key)

	if c.head == c.tail {
		c.head = nil
		c.tail = nil
	} else {
		c.tail = c.tail.prev
		c.tail.next = nil
	}

	return key, value
}

// Move entry to head
func (c *LRUCache) moveToHead(entry *cacheEntry) {
	if entry == c.head {
		return
	}

	if entry.prev != nil {
		entry.prev.next = entry.next
	}

	if entry.next != nil {
		entry.next.prev = entry.prev
	}

	if entry == c.tail {
		c.tail = entry.prev
	}

	entry.next = c.head
	entry.prev = nil

	if c.head != nil {
		c.head.prev = entry
	}

	c.head = entry

	if c.tail == nil {
		c.tail = entry
	}
}

// BST implementation
type HeapEntry struct {
	timestamp int64
	key       string
}

type MinHeap struct {
	entries []HeapEntry
	mutex   sync.Mutex
}

func NewMinHeap() *MinHeap {
	return &MinHeap{
		entries: make([]HeapEntry, 0),
	}
}

func (h *MinHeap) Insert(timestamp int64, key string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	h.entries = append(h.entries, HeapEntry{timestamp, key})
	h.heapifyUp(len(h.entries) - 1)
}

func (h *MinHeap) PopMin() *HeapEntry {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if len(h.entries) == 0 {
		return nil
	}

	min := h.entries[0]
	h.entries[0] = h.entries[len(h.entries)-1]
	h.entries = h.entries[:len(h.entries)-1]

	if len(h.entries) > 0 {
		h.heapifyDown(0)
	}

	return &min
}

func (h *MinHeap) Peek() *HeapEntry {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if len(h.entries) == 0 {
		return nil
	}

	return &h.entries[0]
}

func (h *MinHeap) IsEmpty() bool {
	return len(h.entries) == 0
}

func (h *MinHeap) heapifyUp(index int) {
	for index > 0 {
		parentIndex := (index - 1) / 2
		if h.entries[index].timestamp < h.entries[parentIndex].timestamp {
			h.entries[index], h.entries[parentIndex] = h.entries[parentIndex], h.entries[index]
			index = parentIndex
		} else {
			break
		}
	}
}

func (h *MinHeap) heapifyDown(index int) {
	for {
		smallest := index
		leftChildIndex := 2*index + 1
		rightChildIndex := 2*index + 2

		if leftChildIndex < len(h.entries) && h.entries[leftChildIndex].timestamp < h.entries[smallest].timestamp {
			smallest = leftChildIndex
		}

		if rightChildIndex < len(h.entries) && h.entries[rightChildIndex].timestamp < h.entries[smallest].timestamp {
			smallest = rightChildIndex
		}

		if smallest != index {
			h.entries[index], h.entries[smallest] = h.entries[smallest], h.entries[index]
			index = smallest
		} else {
			break
		}
	}
}

// BST Heap implementation
type BSTHeap struct {
	timestamps   map[string]int64
	realObjects  *MinHeap
	dummyObjects *MinHeap
	mutex        sync.Mutex
}

func NewBSTHeap() *BSTHeap {
	return &BSTHeap{
		timestamps:   make(map[string]int64),
		realObjects:  NewMinHeap(),
		dummyObjects: NewMinHeap(),
	}
}

func (b *BSTHeap) SetTimestamp(key string, ts int64, objType string) {
	b.mutex.Lock()
	defer b.mutex.Unlock()

	b.timestamps[key] = ts

	if objType == "real" {
		b.realObjects.Insert(ts, key)
	} else {
		b.dummyObjects.Insert(ts, key)
	}
}

func (b *BSTHeap) GetTimestamp(key string) int64 {
	b.mutex.Lock()
	defer b.mutex.Unlock()

	if ts, needsResponse := b.timestamps[key]; needsResponse {
		return ts
	}
	return 0
}

func (b *BSTHeap) PopMin(objType string) string {
	if objType == "dummy" {
		if entry := b.dummyObjects.PopMin(); entry != nil {
			return entry.key
		}
	} else {
		if entry := b.realObjects.PopMin(); entry != nil {
			return entry.key
		}
	}
	return ""
}

func (b *BSTHeap) AddObject(key string, objType string) {
	b.mutex.Lock()
	defer b.mutex.Unlock()

	ts, needsResponse := b.timestamps[key]
	if !needsResponse {
		ts = 0
		b.timestamps[key] = ts
	}

	if objType == "real" {
		b.realObjects.Insert(ts, key)
	} else {
		b.dummyObjects.Insert(ts, key)
	}
}

// Helper functions
func getIndex(key string, ts int64) string {
	hash := sha256.Sum256([]byte(fmt.Sprintf("%s:%d", key, ts)))
	return fmt.Sprintf("%x", hash)
}

func objectIsReal(key string) bool {
	return !strings.HasPrefix(key, "dummy_")
}

// Request handler
type DedupRequest struct {
	RID      string
	NeedResp bool
}

func handleRequests(requests []Request, etcdClient *clientv3.Client) map[string]interface{} {
	cliResp := make(map[string][]interface{})
	dedupReqs := make(map[string][]DedupRequest)
	timestamp := time.Now().Unix()

	// Process requests
	for _, req := range requests {
		if req.Key == "" {
			continue
		}

		log.Printf("Processing request: %v", req)

		// Read request
		if req.Op == "read" {
			// Checks the cache
			if val, needsResponse := cache.Get(req.Key); needsResponse {
				if _, exists := cliResp[req.RID]; !exists {
					cliResp[req.RID] = []interface{}{}
				}
				cliResp[req.RID] = append(cliResp[req.RID], val)
				// If it's not in the cache
			} else {
				// If the value doesn't need a response
				if _, needsResponse := dedupReqs[req.Key]; !needsResponse {
					dedupReqs[req.Key] = []DedupRequest{}
				}
				dedupReqs[req.Key] = append(dedupReqs[req.Key], DedupRequest{
					RID:      req.RID,
					NeedResp: true,
				})
			}
			bst.AddObject(req.Key, "real")
		}

		// Write request
		if req.Op == "write" && req.Val != nil {
			if !cache.Has(req.Key) {
				if _, needsResponse := dedupReqs[req.Key]; !needsResponse {
					dedupReqs[req.Key] = []DedupRequest{}
				}
				dedupReqs[req.Key] = append(dedupReqs[req.Key], DedupRequest{
					RID:      req.RID,
					NeedResp: false,
				})
			}
			cache.Put(req.Key, req.Val)
			bst.AddObject(req.Key, "real")
			// if _, exists := cliResp[req.RID]; !exists {
			// 	cliResp[req.RID] = []interface{}{}
			// }

			// Returning write requests
			// cliResp[req.RID] = append(cliResp[req.RID], req.Val)
		}
	}

	// Initialize read batch with dedup requests
	readBatch := make(map[string]string)
	for key := range dedupReqs {
		idx := getIndex(key, timestamp)
		readBatch[idx] = key
		bst.SetTimestamp(key, timestamp, "real")
	}

	// Fill with dummy queries
	for i := 0; i < FAKE_DUMMY_COUNT; i++ {
		dummyKey := bst.PopMin("dummy")
		if dummyKey != "" {
			idx := getIndex(dummyKey, timestamp)
			readBatch[idx] = dummyKey
			bst.SetTimestamp(dummyKey, timestamp, "dummy")
		}
	}

	// Add real objects to fill batch
	remainingSlots := BATCH_SIZE - len(readBatch)
	for i := 0; i < remainingSlots; i++ {
		realKey := bst.PopMin("real")
		// Edge case: When the proxy first boots, this won't work
		if realKey != "" {
			bst.SetTimestamp(realKey, timestamp, "real")
			// We have to avoid values from the cache
			if !cache.Has(realKey) {
				idx := getIndex(realKey, timestamp)
				readBatch[idx] = realKey
			}
		}
	}

	// Add more dummy objects if needed
	if len(readBatch) < BATCH_SIZE {
		remainingSlots = BATCH_SIZE - len(readBatch)
		for i := 0; i < remainingSlots; i++ {
			dummyKey := bst.PopMin("dummy")
			if dummyKey != "" {
				idx := getIndex(dummyKey, timestamp)
				readBatch[idx] = dummyKey
				bst.SetTimestamp(dummyKey, timestamp, "dummy")
			}
		}
	}

	log.Printf("Dedup requests: %v", getMapKeys(dedupReqs))

	// Fetch from etcd
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	responses := make(map[string]string)
	responseMutex := sync.Mutex{}

	for idx, key := range readBatch {
		wg.Add(1)
		go func(idx, key string) {
			defer wg.Done()

			resp, err := etcdClient.Get(ctx, key)
			if err != nil {
				log.Printf("Error fetching key %s: %v", key, err)
				return
			}
			if len(resp.Kvs) > 0 {
				responseMutex.Lock()
				responses[idx] = string(resp.Kvs[0].Value)
				responseMutex.Unlock()
			}
		}(idx, key)
	}

	wg.Wait()

	// Process responses and prepare write batch
	writeBatch := make(map[string]string)
	for idx, val := range responses {
		key := readBatch[idx]

		if reqs, needsResponse := dedupReqs[key]; needsResponse {
			for _, req := range reqs {
				if req.NeedResp {
					if _, exists := cliResp[req.RID]; !exists {
						cliResp[req.RID] = []interface{}{}
					}
					cliResp[req.RID] = append(cliResp[req.RID], val)
				}
			}

			if objectIsReal(key) {
				evictedKey, evictedVal := cache.Evict()
				if evictedKey != "" {
					writeBatch[getIndex(evictedKey, timestamp)] = fmt.Sprintf("%v", evictedVal)
				}
				cache.Put(key, val)
			} else {
				writeBatch[getIndex(key, timestamp)] = ""
			}
		}
	}

	// Write batch to etcd
	log.Printf("Writing %d keys to etcd...", len(writeBatch))

	for idx, val := range writeBatch {
		_, err := etcdClient.Put(ctx, idx, val)
		if err != nil {
			log.Printf("Error writing key %s: %v", idx, err)
		}
	}

	// Convert response lists to interface{} for returning
	result := make(map[string]interface{})
	for rid, vals := range cliResp {
		if len(vals) == 1 {
			result[rid] = vals[0]
		} else {
			result[rid] = vals
		}
	}

	return result
}

// Global variables
var (
	cache = NewLRUCache(100)
	bst   = NewBSTHeap()
)

func getMapKeys(m map[string][]DedupRequest) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func getMapValues(m map[string]string) []string {
	values := make([]string, 0, len(m))
	for _, v := range m {
		values = append(values, v)
	}
	return values
}

func main() {
	// Initialize dummy objects
	for i := 0; i < TOTAL_DUMMIES; i++ {
		dummyKey := fmt.Sprintf("dummy_%d", i)
		bst.AddObject(dummyKey, "dummy")
	}

	// Set up HTTP server
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		var requests []Request
		if err := json.NewDecoder(r.Body).Decode(&requests); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		etcdClient, err := clientv3.New(clientv3.Config{
			Endpoints:   []string{"http://localhost:2379"},
			DialTimeout: 5 * time.Second,
		})
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer etcdClient.Close()

		responses := handleRequests(requests, etcdClient)
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(responses); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})

	log.Println("Proxy running on port 5000")
	log.Fatal(http.ListenAndServe(":5000", nil))
}
