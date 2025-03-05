# UCSC CSE239A (Winter Quarter 2025): Locker

## Introduction

This is an implementation, written by Ismail Ahmed and Sallar Farokhi in Golang and Bash, of the Waffle oblivious computation (OC) research paper for the etcd data storage that obscures all data access patterns between a trusted client and an untrusted original server by routing all communications through a trusted third-party proxy. It is adjustable and easily modifiable, with the number of users, requests, and constants being easily updatable inside the proxy.go file and its API. By default, it doesn't contain any encryption or authentication for the etcd server itself (as it uses the default etcd server), but that could be added by writing a custom etcd config file or by using an external etcd encryption library. It was designed to be used in a Linux server with Bash and was only tested on an Ubuntu 20.04 virtual machine. Its use cases involve any client-server communication that needs to be secret and secure, with the necessary caveats. Future aspirations are to extend Locker to Kubernetes or even publish Locker as a Helm module.

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

### Installing the Golang Modules (listed in `go.mod`)

```bash
go mod tidy
```

### Starting the server and proxy

First Terminal Session (version 3.5):

```bash
etcd
```

Second Terminal Session (version go1.22.1):

```bash
go run proxy.go
```

### GET/PUT Request Formats

```bash
curl -s -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "read", "key": "foo"}]'
curl -s -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "read", "key": "foo"},{"rid": "2", "op": "read", "key": "bar"}]'
curl -s -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "write", "key": "foo", "val": "bar"}]'
```

### Running the benchmarks (testing code)

Third Terminal Session (the benchmark's data log file is in `execs/data.txt`):

```bash
cd execs/
sudo chmod +x init.sh
sudo chmod +x benchmark.sh
./init.sh
./benchmark.sh
```

## License

Locker © 2025 by Sallar Farokhi, Ismail Ahmed is licensed under Creative Commons Attribution 4.0 International
