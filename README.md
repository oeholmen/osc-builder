# osc-builder
A repo for building osc interfaces in the browser, using node.js, socket.io and node-osc.

## Available arguments

1. Program path (programs/example.json)
2. Level (0-3), see explanation below - (default 0)
3. Minimum parameters per client - (default 1)
4. Client port - this is the port the node server listens to (default 3000)
5. Server host - this is the host for the osc server (default localhost)
6. Server port - this is the port on the osc server (default 3334)

## Levels

0. Full access
1. Client gets assigned controls
2. Client only sees assigned controls
3. Client does not see control labels

### *NOTE* Fix for deprecation warning

https://github.com/bitwarden/clients/issues/6689
