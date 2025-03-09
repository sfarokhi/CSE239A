#!/bin/bash

# The performance benchmarking requires `bc` to be installed locally
start=$(date +%s.%N)

# Default configuration parameters
NUM_REQUESTS=5         # Number of requests to send
MAX_BATCH_SIZE=25      # Maximum number of operations per batch
MAX_VAL_SIZE=3         # Maximum value size in bytes
READ_PERCENTAGE=50     # Default: 50% reads, 50% writes

# Process command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -n|--num-requests)
      NUM_REQUESTS="$2"
      shift 2
      ;;
    -b|--batch-size)
      MAX_BATCH_SIZE="$2"
      shift 2
      ;;
    -v|--val-size)
      MAX_VAL_SIZE="$2"
      shift 2
      ;;
    -r|--read-percentage)
      READ_PERCENTAGE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  -n, --num-requests NUM      Number of requests to send (default: 5)"
      echo "  -b, --batch-size MAX        Maximum operations per batch (default: 25)"
      echo "  -v, --val-size MAX          Maximum value size in bytes (default: 3)"
      echo "  -r, --read-percentage PCT   Percentage of read operations (default: 50)"
      echo "  -h, --help                  Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Validate read percentage
if [ "$READ_PERCENTAGE" -lt 0 ] || [ "$READ_PERCENTAGE" -gt 100 ]; then
  echo "Error: Read percentage must be between 0 and 100"
  exit 1
fi

# Possible operation types
# OPS=("read" "write")

# Read keys from file, each on a new line
KEYS=()
while IFS= read -r line; do
    KEYS+=("$line")
done < "medium_keys.txt"

USERS=("user1" "user2" "user3" "user4" "user5" "user6" "user7" "user8" "user9" "user10")

# Target URL
URL="http://localhost:5000"

# Clear data file at the start
echo "Benchmark data log" > default_data.txt
echo "Configuration: $NUM_REQUESTS requests, max batch size $MAX_BATCH_SIZE, read percentage $READ_PERCENTAGE%" >> default_data.txt

for ((i=1; i<=NUM_REQUESTS; i++)); do
    # Determine batch size for this request (between 1 and MAX_BATCH_SIZE)
    BATCH_SIZE=$((1 + RANDOM % MAX_BATCH_SIZE))
    
    # Generate the JSON array for the batch
    DATA="["
    
    for ((j=1; j<=BATCH_SIZE; j++)); do
        # Determine operation based on read percentage
        RAND=$((RANDOM % 100 + 1))
        if [ $RAND -le $READ_PERCENTAGE ]; then
            OP="read"
        else
            OP="write"
        fi
        
        # Generate random key and user
        KEY=${KEYS[$RANDOM % ${#KEYS[@]}]}
        USER=${USERS[$RANDOM % ${#USERS[@]}]}
        
        # Generate value (only needed for writes, but generate anyway)
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
    
    # Log request information to default_data.txt with append (>>)
    echo -e "\n======= Request $i =======" >> default_data.txt
    echo "Batch size: $BATCH_SIZE" >> default_data.txt
    echo "Data: $DATA" >> default_data.txt
    
    # Send curl request and capture response
    RESPONSE=$(curl -s -X POST "$URL" -H "Content-Type: application/json" -d "$DATA")
    
    # Log response
    echo "Response: $RESPONSE" >> default_data.txt
    
    echo "Request $i sent with batch size: $BATCH_SIZE"
done

# Performance benchmarking in seconds
end=$(date +%s.%N)
runtime=$(echo "$end - $start" | bc)

echo "The benchmark's runtime was $runtime seconds."
echo "Runtime: $runtime seconds" >> default_data.txt
echo "Final configuration: $NUM_REQUESTS requests, read percentage $READ_PERCENTAGE%" >> default_data.txt