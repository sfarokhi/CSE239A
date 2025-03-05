#!/bin/bash

MAX_UPLOADED_VALUES=385  # Maximum number of values to upload
MAX_VAL_SIZE=3          # Maximum value size in bytes

# Read keys from file, ensuring no empty lines
KEYS=()
while IFS= read -r line || [[ -n "$line" ]]; do
    KEYS+=("$line")
done < "keys.txt"

# Initialize the database with key-value pairs
for ((i=0; i<MAX_UPLOADED_VALUES && i<${#KEYS[@]}; i++)); do
    KEY="${KEYS[i]}"
    
    # Generate a random value (alphanumeric)
    VALUE=$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c $MAX_VAL_SIZE)
    
    # JSON payload for etcd v3 API
    RESPONSE=$(curl -X POST http://127.0.0.1:2379/v3/kv/put \
        -H "Content-Type: application/json" \
        --data-binary "{\"key\":\"$(echo -n "$KEY" | base64)\",\"value\":\"$(echo -n "$VALUE" | base64)\"}")
    
    # Log response
    echo "Initialized $KEY with $VALUE: $RESPONSE"
done

echo "Database initialization complete."