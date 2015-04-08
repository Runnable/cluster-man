# cluster-man

Extendable and easy-to-use node cluster management.

## Usage

**Via Environment Configuration**/
```js
// Load your environment
require('loadenv')();

// Grab a copy of the cluster manager class
var ClusterManager = require('cluster-man');

// Instantiate a new ClusterManager and give it a worker method to execute on
// all worker processes. The manager will look into the environment and
// configure itself based on the following:
//
// - `process.env.CLUSTER_WORKERS` - Number of workers to fork
// - `process.env.CLUSTER_DEBUG` - Default debug namespace for logging
var manager = new ClusterManager(function () {
  // Do work here, such as server.start() or whatnot...
});

// Finally, start your cluster!
manager.start();
```

**Via Custom Options**
```js
var ClusterManager = require('cluster-man');
var manager = new ClusterManager({
  // Worker processes execute this on process start:
  worker: function () {
    // ...
  },

  // Master process executes this when you call `manager.start()`:
  master: function () {
    // ...
  },

  // Explicitly tell it the number of workers to fork:
  numWorkers: 16
});

// Start the cluster!
manager.start();
```
