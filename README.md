# CSE239A: Locker

## Introduction

This is an implementation, written by Ismail Ahmed and Sallar Farokhi in JavaScript and Bash, of the Waffle oblivious computation (OC) research paper for the etcd data storage that obscures all data access patterns between a trusted client and an untrusted original; server by routing all communications through a trusted third-party proxy. It is adjustable and easily modifiable, with the number of users, requests, and constants being easily updatable inside the proxy.js file and client files. By default, it doesn't containy any encryption or auhmeticaon for the etcd server itself, but that could be added by writing a custom etcd config file or by using an extra etcd encryption library. Future aspirations are to extend Locker to Kubernetes or even publish Locker as a Helm module. 

## Usage

### Install NVM to a blank bashrc

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### Starting the server and proxy

First Terminal Session:

```bash
etcd
```

Second Terminal Session:

```bash
node proxy.js
```

### GET/PUT Request Formats

```bash
curl -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "read", "key": "foo"}]'
curl -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "read", "key": "foo"},{"rid": "2", "op": "read", "key": "bar"}]'
curl -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "write", "key": "foo", "val": "bar"}]'
```

### Running the benchmarks (using the previous testing code)

Third Terminal Session:

```bash
sudo chmod +x benchmark.sh
sudo chmod +x init.sh
./init.sh
./benchmark.sh
```

## License

Locker © 2025 by Sallar Farokhi, Ismail Ahmed is licensed under Creative Commons Attribution 4.0 International
