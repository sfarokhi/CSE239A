#!/bin/bash
MAX_VAL_SIZE=3          # Maximum value size in bytes
BATCH_SIZE=100          # Number of key-value pairs to batch in one request

# Function to display progress bar
show_progress() {
    local current=$1
    local total=$2
    local width=50
    local percentage=$((current * 100 / total))
    local completed=$((width * current / total))
    
    printf "\r[%${completed}s%${width-completed}s] %d%% (%d/%d)" | tr ' ' '█' | tr ' ' '░'
    printf " %d%% (%d/%d)" "$percentage" "$current" "$total"
}

# Check if filename was provided
if [ $# -lt 1 ]; then
    echo "Usage: $0 <keys_filename> [max_values]"
    exit 1
fi

KEYS_FILE="$1"

# Check if file exists
if [ ! -f "$KEYS_FILE" ]; then
    echo "Error: File '$KEYS_FILE' not found"
    exit 1
fi

# Read keys from file, ensuring no empty lines
KEYS=()
while IFS= read -r line || [[ -n "$line" ]]; do
    KEYS+=("$line")
done < "$KEYS_FILE"

# Set MAX_UPLOADED_VALUES based on command line argument or default to all keys
if [ $# -ge 2 ] && [[ "$2" =~ ^[0-9]+$ ]]; then
    MAX_UPLOADED_VALUES=$2
else
    MAX_UPLOADED_VALUES=${#KEYS[@]}
fi

# Make sure we don't try to upload more keys than we have
if [ $MAX_UPLOADED_VALUES -gt ${#KEYS[@]} ]; then
    MAX_UPLOADED_VALUES=${#KEYS[@]}
fi

echo "Initializing database with $MAX_UPLOADED_VALUES keys in batches of $BATCH_SIZE..."

# Process in batches
completed=0
while [ $completed -lt $MAX_UPLOADED_VALUES ]; do
    # Determine current batch size
    current_batch_size=$BATCH_SIZE
    if [ $((completed + BATCH_SIZE)) -gt $MAX_UPLOADED_VALUES ]; then
        current_batch_size=$((MAX_UPLOADED_VALUES - completed))
    fi
    
    # Prepare the batch request
    batch_json='{"txn":{"success":[{'
    
    for ((i=0; i<current_batch_size; i++)); do
        idx=$((completed + i))
        KEY="${KEYS[idx]}"
        
        # Generate a random value (alphanumeric)
        VALUE=$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c $MAX_VAL_SIZE)
        
        # Add to batch
        if [ $i -gt 0 ]; then
            batch_json+=','
        fi
        
        batch_json+="\"requestPut\":{\"key\":\"$(echo -n "$KEY" | base64)\",\"value\":\"$(echo -n "$VALUE" | base64)\"}"
    done
    
    batch_json+='}]}}'
    
    # Send batch request
    RESPONSE=$(curl -s -X POST http://127.0.0.1:2379/v3/kv/txn \
        -H "Content-Type: application/json" \
        --data-binary "$batch_json")
    
    # Update completed count
    completed=$((completed + current_batch_size))
    
    # Show progress
    show_progress $completed $MAX_UPLOADED_VALUES
done

echo -e "\nDatabase initialization complete."