#!/bin/bash

# The performance benchmarking requires `bc` to be installed locally
start=$(date +%s.%N)

# Configuration parameters
NUM_REQUESTS=3         # Number of requests to send (up to 25 for security purposes)
MAX_BATCH_SIZE=25      # Maximum number of operations per batch
MAX_VAL_SIZE=3         # Maximum value size in bytes

# Possible operation types
OPS=("read" "write")

# Read keys from file, each on a new line
KEYS=()
while IFS= read -r line; do
    KEYS+=("$line")
done < "keys.txt"

USERS=("user1" "user2" "user3" "user4" "user5" "user6" "user7" "user8" "user9" "user10")

# Target URL
URL="http://localhost:5000"

# Clear data file at the start
echo "Benchmark data log" > data.txt

for ((i=1; i<=NUM_REQUESTS; i++)); do
    # Determine batch size for this request (between 1 and MAX_BATCH_SIZE)
    BATCH_SIZE=$((1 + RANDOM % MAX_BATCH_SIZE))
    
    # Generate the JSON array for the batch
    DATA="["
    
    for ((j=1; j<=BATCH_SIZE; j++)); do
        # Generate random key and operation
        KEY=${KEYS[$RANDOM % ${#KEYS[@]}]}
        OP=${OPS[$RANDOM % ${#OPS[@]}]}
        USER=${USERS[$RANDOM % ${#USERS[@]}]}
        
        # Fixed value generation - using only alphanumeric characters
        # Generate a simpler random string with no special characters
        VAL_SIZE=$((1 + RANDOM % MAX_VAL_SIZE))
        VAL=$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c $VAL_SIZE | base64)
        
        # Add operation to batch
        DATA+="{"
        DATA+="\"rid\":\"$USER\","
        DATA+="\"op\":\"$OP\","
        DATA+="\"key\":\"$KEY\","
        DATA+="\"val\":\"$VAL\""
        DATA+="}"
        
        # Add comma if not the last item in batch
        if [ $j -lt $BATCH_SIZE ]; then
            DATA+=","
        fi
    done
    
    DATA+="]"
    
    # Log request information to data.txt with append (>>)
    echo -e "\n======= Request $i =======" >> data.txt
    echo "Batch size: $BATCH_SIZE" >> data.txt
    echo "Data: $DATA" >> data.txt
    
    # Send curl request and capture response
    RESPONSE=$(curl -s -X POST "$URL" -H "Content-Type: application/json" -d "$DATA")
    
    # Log response
    echo "Response: $RESPONSE" >> data.txt
    
    echo "Request $i sent with batch size: $BATCH_SIZE"
    sleep 1 # Optional delay between requests
done

# Highly accurate performance benchmarking in seconds
end=$(date +%s.%N)
runtime=$(echo $end - $start | bc)
echo "The benchmark's runtime was $runtime seconds."
echo "Runtime: $runtime seconds" >> data.txt