#!/bin/bash

# The performance benchmarking requires `bc` to be installed locally
start=$(date +%s.%N)

# Number of requests to send
NUM_REQUESTS=10

# Possible operation types
OPS=("write" "read")

# Possible keys
KEYS=("foo" "bar" "baz" "qux" "quix" "corge" "mux" "qrrx")

# Target URL
URL="http://localhost:5000"

for ((i=1; i<=NUM_REQUESTS; i++)); do
    # Generate random keys and ops
    KEY1=${KEYS[$RANDOM % ${#KEYS[@]}]}
    KEY2=${KEYS[$RANDOM % ${#KEYS[@]}]}
    OP1=${OPS[$RANDOM % ${#OPS[@]}]}
    OP2=${OPS[$RANDOM % ${#OPS[@]}]}
    
    # Generate JSON payload
    DATA="[{\"rid\": \"$i\", \"op\": \"$OP1\", \"key\": \"$KEY1\", \"val\": \"asd\"},{\"rid\": \"$((i+NUM_REQUESTS))\", \"op\": \"$OP2\", \"key\": \"$KEY2\", \"val\": \"asd\"}]"
    
    echo "Sending request $i with data: $DATA"
    
    # Send curl request
    curl -X POST "$URL" -H "Content-Type: application/json" -d "$DATA"
    
    echo ""
    sleep 1 # Optional delay between requests

done


# Highly accurate performance benchmarking in seconds
end=$(date +%s.%N)
runtime=$(echo $end - $start | bc)
echo "The benchmark's runtime was $runtime seconds."