# CSE239A: Locker

Locker © 2025 by Sallar Farokhi, Ismail Ahmed is licensed under Creative Commons Attribution 4.0 International 

## Ismail Ahmed & Sallar Farokhi

## Add to bashrc
```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

## Starting the server and proxy
```
sudo chmod +x etcd.sh
./etcd.sh
node proxy.sh
```

## GET/PUT Request
```
curl -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "read", "key": "foo"}]'
curl -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "read", "key": "foo"},{"rid": "2", "op": "read", "key": "bar"}]'
curl -X POST http://localhost:5000   -H "Content-Type: application/json"   -d '[{"rid": "1", "op": "write", "key": "foo", "val": "bar"}]'
```
