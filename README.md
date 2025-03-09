# UCSC CSE239A (Winter Quarter 2025): Locker

## Introduction

This is an implementation, written by Ismail Ahmed and Sallar Farokhi in Golang and Bash, of the Waffle oblivious computation (OC) research paper for the etcd data storage that obscures all data access patterns between a trusted client and an untrusted original server by routing all communications through a trusted third-party proxy. It is adjustable and easily modifiable, with the number of users, requests, and constants being easily updatable inside the proxy.go file and its API. By default, it doesn't contain any encryption or authentication for the etcd server itself (as it uses the default etcd server), but that could be added by writing a custom etcd config file or by using an external etcd encryption library. It was designed to be used in a Linux server with Bash and was only tested on an Ubuntu 20.04 virtual machine. Its use cases involve any client-server communication that needs to be secret and secure, with the necessary caveats (including the fact that, in a response, a single value is a string but multiple objects are lists). Future aspirations are to extend Locker to Kubernetes or even publish Locker as a Helm module.

## Usage

### Install GVM for Golang (version go1.22.1)

```bash
gvm install go1.4 -B
gvm use go1.4
export GOROOT_BOOTSTRAP=$GOROOT
gvm install go1.17.13
gvm use go1.17.13
export GOROOT_BOOTSTRAP=$GOROOT
gvm install go1.22.1
gvm use go1.22.1
export GOROOT_BOOTSTRAP=$GOROOT
```

### Install Homebrew for etcd (version 3.5.18)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew update
brew install etcd
```

### Installing the Golang Modules (listed in `go.mod`)

```bash
go mod tidy
```

### Starting the server and proxy

First Terminal Session:
NOTE: Must be using Version 3.5 (latest) of etcd
Or a version that supports the v3 API
```bash
etcd
```

Second Terminal Session:

```bash
gvm use go1.22.1 
go run proxy.go
```

### Running the benchmarks for the Waffle proxy (testing code)

Third Terminal Session (the benchmark's data log file is in `execs/data_waffle.txt`):

First, set up the shell scripts
```bash
cd execs/
sudo chmod +x init.sh
sudo chmod +x benchmark_waffle.sh
```

Then, we init the database with the txt file and the number of values to input (defaults to the entire file)
```bash
./init.sh <small_keys.txt | medium_keys.txt | large_keys.txt> <MAX_VALUES>
```

Lastly, we run the benchmark, using either the proxy or the native etcd
```bash
./benchmark_waffle.sh
./benchmark_default.sh
```


This is the format that the curl requests must adhere to in order to use the proxy:


### GET/PUT Request Formats
```json
data: [
    {"rid", "op", "key", "val"}
]
```
```bash
curl -s -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "read", "key": "foo"}]'
curl -s -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "read", "key": "foo"},{"rid": "2", "op": "read", "key": "bar"}]'
curl -s -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "write", "key": "foo", "val": "bar"}]'
```



## License

Locker © 2025 by Sallar Farokhi, Ismail Ahmed is licensed under Creative Commons Attribution 4.0 International
