'use strict';

require('loadenv')('cluster-man');

var cluster = require('cluster');
var debug = require('debug');
var domain = require('domain');
var os = require('os');
var isFunction = require('101/is-function');
var noop = require('101/noop');
var pluck = require('map-utils').pluck;

/**
 * Extendable and easy-to-use node cluster management.
 * @module cluster-man
 * @author Ryan Sandor Richards, Anandkumar Patel
 */
module.exports = ClusterManager;

/**
 * Utility class for creating new server clusters.
 *
 * @example
 * var ClusterMan = require('cluster-man');
 * var server = require('./lib/server');
 *
 * // Basic usage (if you only need to handle workers)
 * new ClusterMan(server.start).start();
 *
 * @example
 * var ClusterMan = require('cluster-man');
 * var server = require('./lib/server');
 *
 * // Create a new cluster manager using options, for handling master process
 * // and worker processes with a specific number of workers.
 * var serverCluster = new ClusterManager({
 *   worker: server.start,
 *   master: masterStart,
 *   numWorkers: 4
 * });
 *
 * function masterStart(clusterManager) {
 *   // Any additional things you'd like to do after the cluster
 *   // has started...
 * }
 *
 * // Start the cluster
 * serverCluster.start();
 *
 * @author Ryan Sandor Richards.
 * @param {object|function} opts Options for the cluster or a worker function to
 *   execute on worker processes.
 * @param {cluster-man~Callback} opt.worker Function to execute on the worker
 *   processes.
 * @param {cluster-man~Callback} opt.master Function to execute on the master
 *   process.
 * @param {Number} opt.numWorkers Number of workers to spawn. Defaults to the
 *   value in `process.env.CLUSTER_WORKERS` if present, and if not then the
 *   number of CPUs as reported by `os.cpus().length`.
 * @param {String} opt.debug Scope Root scope for debug logging. Defaults to the
 *   value in `process.env.CLUSTER_DEBUG` if present, and if not then defaults
 *   to 'cluster-man'.
 * @throws Error If a opt.worker was not specified or was not a function.
 */
function ClusterManager(opts) {
  if (isFunction(opts)) {
    opts = { worker: opts };
  }

  this.options = opts = opts || {};

  if (!opts.debugScope) {
    opts.debugScope = process.env.CLUSTER_DEBUG || 'cluster-man';
  }

  this._addLogger('info', [opts.debugScope, 'info'].join(':'));
  this._addLogger('warning', [opts.debugScope, 'warning'].join(':'));
  this._addLogger('error', [opts.debugScope, 'error'].join(':'));

  if (!opts.master || !isFunction(opts.master)) {
    this.log.warning('Cluster not provided with a master closure.');
    opts.master = noop;
  }

  if (!opts.worker || !isFunction(opts.worker)) {
    throw new Error('Cluster must be provided with a worker closure.');
  }

  if (!opts.numWorkers) {
    if (!process.env.CLUSTER_WORKERS) {
      this.log.warning('Number of workers not specified, using default.');
    }
    opts.numWorkers = process.env.CLUSTER_WORKERS || os.cpus().length;
  }

  this.workers = [];

  // This is here to expose the cluster without having to re-require in the
  // script that uses cluster-man
  this.cluster = cluster;
}

/**
 * Starts either a cluster master or a worker depending on the process type at
 * the time of invocation.
 */
ClusterManager.prototype.start = function () {
  if (this.cluster.isMaster) {
    this._startMaster();
  }
  else {
    this._startWorker();
  }
};

/**
 * Adds a logger debug method to the manager.
 * @param {string} name Name of the logger method.
 * @param {string} label Output label for debug.
 */
ClusterManager.prototype._addLogger = function (name, label) {
  if (!this.log) {
    this.log = {};
  }
  this.log[name] = debug(label);
};

/**
 * Starts a cluster master. Specifically this will bind worker events to
 * specific handlers on this manager instance, fork all worker process, setup a
 * domain to catch unhandled errors on the master process and execute the master
 * process callback (as specified in the constructor).
 */
ClusterManager.prototype._startMaster = function() {
  var self = this;

  // Setup master process domain error handling
  var masterDomain = domain.create();
  masterDomain.on('error', function() {
    self.masterError.apply(self, arguments);
  });
  masterDomain.add(this);

  // Bind cluster events to this object.
  var eventNames = ['fork', 'listening', 'exit', 'online', 'disconnect'];
  eventNames.forEach(function (eventName) {
    self.cluster.on(eventName, function() {
      self[eventName].apply(self, arguments);
    });
  });

  // Spawn workers
  for (var i = 0; i < this.options.numWorkers; i++) {
    this.createWorker();
  }

  // Execute master callback from options
  masterDomain.run(function () {
    self.options.master(this);
  });
};

/**
 * Starts a cluster worker. Simply executes the provided worker callback.
 */
ClusterManager.prototype._startWorker = function() {
  this.options.worker(this);
};

/**
 * Creates a new worker. Specifically it forks a new worker, sets a domain error
 * handler for the worker, and returns it.
 * @return {cluster~Worker} Newly created worker.
 */
ClusterManager.prototype.createWorker = function () {
  var self = this;
  var worker = this.cluster.fork();

  // Deals with unhandled worker errors
  var workerDomain = domain.create();
  workerDomain.add(worker);
  workerDomain.on('error', function (err) {
    self.log.error('Unhandled worker error: ' + err.stack);
    worker.process.kill(1);
  });

  this.workers.push(worker);
  this.log.info('Created new worker: ' + worker.id);
  return worker;
};

/**
 * Handles worker `fork` events. This event is emitted when a worker is forked
 * off the master cluster.
 * @param {cluster~Worker} Worker that was forked.
 */
ClusterManager.prototype.fork = function (worker) {
  this.log.info('Worker forked: ' + worker.id);
};

/**
 * Handles worker `listening` events. Indicates to the master that a particular
 * worker is listening.
 * @param {cluster~Worker} Worker that is now listening.
 * @param address Address on which the worker is listening.
 */
ClusterManager.prototype.listening = function (worker, address) {
  this.log.info([
    'Worker listening:', worker.id,
    'on address', (address.address+':'+address.port)
  ].join(' '));
};

/**
 * Handles worker `exit` events.
 * @param {cluster~Worker} worker Worker that exited.
 * @param {Number} code Exit code for the worker process.
 * @param {String} signal Signal name that caused the process to be killed.
 */
ClusterManager.prototype.exit = function (worker, code, signal) {
  this.log.info([
    'Worker exited:', worker.id,
    '-- with status:', code,
    '-- and signal:', signal
  ].join(' '));

  var self = this;
  this.workers.map(pluck('id')).some(function (workerId, i) {
    if (workerId === worker.id) {
      self.workers.splice(i, 1);
    }
  });
};

/**
 * Handles worker `online` events. This indicates to the cluster that a worker
 * process has successfully spawned a process and is running.
 * @param {cluster~Worker} worker Worker that came online.
 */
ClusterManager.prototype.online = function (worker) {
  this.log.info('Worker online: ' + worker.id);
};

/**
 * Handles worker `disconnect` events. This indicates that the worker has
 * disconnected from communication but is not nessessarily dead.
 * @param {cluster~Worker} worker Worker that disconnected.
 */
ClusterManager.prototype.disconnect = function (worker) {
  this.log.info('Worker disconnected: ' + worker.id + ' -- killing');
};

/**
 * Called when master process domain encounters an unhandled error. By default
 * this method will log the error stack, indicate that the error is fatal, and
 * kill the process with a status code `1`.
 * @param {Error} err Unhandled error on the master process.
 */
ClusterManager.prototype.masterError = function(err) {
  this.log.error('Unhandled master error: ' + err.stack);

  // TODO Should we really kill the process here by default?
  this.log.error('Cluster fatal: unhandled error in master process, exiting.');
  process.exit(1);
};
