# CSE239A: Locker

## Introduction

This is an implementation, written by Ismail Ahmed and Sallar Farokhi in JavaScript and Bash, of the Waffle oblivious computation (OC) research paper for the etcd data storage that obscures all data access patterns between a trusted client and an untrusted original; server by routing all communications through a trusted third-party proxy.

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
sudo chmod +x etcd.sh
./etcd.sh
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

### Running the tests (currently passes all test)

Third Terminal Session:

```bash
sudo chmod +x test.sh
./test.sh
```

### Running the benchmarks (using the current testing code)

Third Terminal Session:

```bash
sudo chmod +x benchmark.sh
./benchmark.sh
```

## License

Locker © 2025 by Sallar Farokhi, Ismail Ahmed is licensed under Creative Commons Attribution 4.0 International
