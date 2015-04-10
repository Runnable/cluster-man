# cluster-man

Extendable and easy-to-use node cluster management.

## Basic Usage

**Via Environment Configuration**

By Default cluster-man configure itself via `process.env` by using the following
variables:

- `process.env.CLUSTER_WORKERS` (Integer) - Number of workers to fork from the
  master process when the cluster is started.
- `process.env.CLUSTER_DEBUG` (String) - Prefix for cluster event logging via
  [debug](https://www.npmjs.com/package/debug)

Here's an example of how to use cluster man with as little configuration as
possible:

```js
// Load your environment
require('loadenv')();

// Grab a copy of the cluster manager class
var ClusterManager = require('cluster-man');

// Instantiate a new manager using environment variable configuration
var manager = new ClusterManager(function () {
  // This is the closure called after worker processes are forked
});

// Finally, start your cluster!
manager.start();
```

**Via Custom Options**

Developers can also instantiate a `ClusterManager` using options to configure
how the manager operates, like so:

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
  numWorkers: 16,

  // Tell it not to kill the master process on an un-handled error
  // (sometimes useful, not recommended)
  killOnError: false
});

// Start the cluster!
manager.start();
```

## API Documentation

Coming Soon!

## Extending ClusterManager

While we think that the basic behaviors encapsulated by cluster-man represent a
reasonable approach to handling clustering, it stands to reason that there will
be times when a developer needs to handle clustering in a specific way for their
application.

To aid such specialized behaviors the `ClusterManager` class was designed to be
extendable via prototypal inheritance. Furthermore, instances expose the node
`cluster` directly so additional eventing can easily be added.

**Example: Adding additional cluster event listeners**
```js
var app = require('./lib/app.js');
var ClusterManager = require('cluster-man');

// Create a new cluster manager for your application
var manager = new ClusterManager(function () {
  app.start();
});

// Spawn new workers when others die...
manager.cluster.on('exit', function (worker, code, signal) {
  var delta = manager.options.numWorkers - manager.workers.length;
  for (var i = 0; i < delta; i++) {
    this.createWorker();
  }
});

// Start the cluster
manager.start();
```

**Example: Worker Start/Stop Monitoring**

Here's an example of how to extend `ClusterManager` to log worker start and stop
information with `monitor-dog`:

```js
var ClusterManager = require('cluster-man');
var monitor = require('monitor-dog');
var inherits = require('util').inherits;
var app = require('./lib/app.js');

function AppManager() {
  ClusterManager.apply(this, arguments);
}
inherits(AppManager, ClusterManager);

// Override `_startWorker` since this manager only works for this particular app
AppManager.prototype._startWorker = function () {
  app.start();
};

// Increment a `workers` key in datadog when a worker is created
AppManager.prototype.createWorker = function() {
  var worker = ClusterManager.prototype.createWorker.apply(this, arguments);
  monitor.increment('workers');
  return worker;
};

// Decrement the `workers` key when a worker dies
AppManager.prototype.exit = function (worker, code, signal) {
  ClusterManager.prototype.exit.call(this, worker, code, signal);
  monitor.increment('workers', -1);
};

// Start the custom cluster
var manager = new AppManager();
manager.start();
```

## License
MIT
