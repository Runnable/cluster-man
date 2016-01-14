'use strict'

var EventEmitter = require('events').EventEmitter
var assert = require('chai').assert
var noop = require('101/noop')
var os = require('os')
var sinon = require('sinon')

require('loadenv')('cluster-man')
var ClusterManager = require('../index.js')

describe('cluster-man', function () {
  describe('methods', function () {
    describe('constructor', function () {
      it('should throw an execption if worker function is missing', function () {
        assert.throws(
          function () { return new ClusterManager() },
          Error,
          'Cluster must be provided with a worker closure.'
        )
        assert.throws(
          function () { return new ClusterManager({ master: function () {} }) },
          Error,
          'Cluster must be provided with a worker closure.'
        )
      })

      it('should correctly assign a worker function', function () {
        var manager = new ClusterManager({ worker: noop })
        assert.equal(manager.options.worker, noop)
      })

      it('should allow construction with only the worker function', function () {
        var manager = new ClusterManager(noop)
        assert.equal(manager.options.worker, noop)
      })

      it('should default the master callback to noop', function () {
        var manager = new ClusterManager(function () { return 'worker' })
        assert.equal(manager.options.master, noop)
      })

      it('should set the master function based on passed options', function () {
        var master = function () { return 'master' }
        var manager = new ClusterManager({
          worker: noop,
          master: master
        })
        assert.equal(manager.options.master, master)
      })

      it('should use `CLUSTER_WORKERS` for `numWorkers`', function () {
        var manager = new ClusterManager(noop)
        assert.equal(manager.options.numWorkers, process.env.CLUSTER_WORKERS)
      })

      it('should use # of CPUs for `numWorkers` if `CLUSTER_WORKERS` is missing', function () {
        var envClusterWorkers = process.env.CLUSTER_WORKERS
        delete process.env.CLUSTER_WORKERS
        var manager = new ClusterManager(noop)
        assert.equal(manager.options.numWorkers, os.cpus().length)
        process.env.CLUSTER_WORKERS = envClusterWorkers
      })

      it('should set `numWorkers` based on passed option', function () {
        var workers = 1337
        var manager = new ClusterManager({ worker: noop, numWorkers: workers })
        assert.equal(manager.options.numWorkers, workers)
      })

      it('should use `CLUSTER_DEBUG` by default for debug scope', function () {
        var scope = process.env.CLUSTER_DEBUG
        var spy = sinon.spy(ClusterManager.prototype, '_addLogger')
        var manager = new ClusterManager(noop)
        assert.ok(manager)
        sinon.assert.calledWith(spy, 'info', scope + ':info')
        sinon.assert.calledWith(spy, 'warning', scope + ':warning')
        sinon.assert.calledWith(spy, 'error', scope + ':error')
        ClusterManager.prototype._addLogger.restore()
      })

      it('should use `cluster-man` as a debug scope if `CLUSTER_DEBUG` is missing', function () {
        var envClusterDebug = process.env.CLUSTER_DEBUG
        delete process.env.CLUSTER_DEBUG
        var scope = 'cluster-man'
        var spy = sinon.spy(ClusterManager.prototype, '_addLogger')
        var manager = new ClusterManager(noop)
        assert.ok(manager)
        sinon.assert.calledWith(spy, 'info', scope + ':info')
        sinon.assert.calledWith(spy, 'warning', scope + ':warning')
        sinon.assert.calledWith(spy, 'error', scope + ':error')
        process.env.CLUSTER_DEBUG = envClusterDebug
        ClusterManager.prototype._addLogger.restore()
      })

      it('should set debug scope based on passed options', function () {
        var scope = 'custom-scope'
        var spy = sinon.spy(ClusterManager.prototype, '_addLogger')
        var manager = new ClusterManager({
          worker: noop,
          debugScope: scope
        })
        assert.ok(manager)
        sinon.assert.calledWith(spy, 'info', scope + ':info')
        sinon.assert.calledWith(spy, 'warning', scope + ':warning')
        sinon.assert.calledWith(spy, 'error', scope + ':error')
        ClusterManager.prototype._addLogger.restore()
      })

      it('should set `killOnError` to true by default', function () {
        var manager = new ClusterManager(noop)
        assert.equal(manager.options.killOnError, true)
      })

      it('should allow the user to set `killOnError` option', function () {
        var manager = new ClusterManager({
          worker: noop,
          killOnError: false
        })
        assert.equal(manager.options.killOnError, false)
      })

      it('should not allow non-function beforeExit option', function () {
        var manager = new ClusterManager({
          worker: noop,
          beforeExit: 'not a function'
        })
        assert.equal(manager.options.beforeExit, noop)
      })
    }) // end 'constructor'

    describe('_addLogger', function () {
      it('should add a logger to `this.log` with the appropriate name', function () {
        var manager = new ClusterManager(noop)
        var name = 'example'
        manager._addLogger(name, name)
        assert.ok(manager.log[name])
        assert.isFunction(manager.log[name])
      })
    }) // end '_addLogger'

    describe('start', function () {
      var manager = new ClusterManager(noop)
      beforeEach(function () {
        sinon.stub(manager, '_startMaster')
        sinon.stub(manager, '_startWorker')
      })

      afterEach(function () {
        manager._startMaster.restore()
        manager._startWorker.restore()
      })

      it('should start master if in the master process', function () {
        manager.cluster = { isMaster: true }
        manager.start()
        sinon.assert.calledOnce(manager._startMaster)
        sinon.assert.notCalled(manager._startWorker)
      })

      it('should start a worker if in a worker process', function () {
        manager.cluster = { isMaster: false }
        manager.start()
        sinon.assert.calledOnce(manager._startWorker)
        sinon.assert.notCalled(manager._startMaster)
      })
    }) // end 'start'

    describe('_startMaster', function () {
      var manager
      var numWorkers = 3
      var master = function () { return 'master' }

      beforeEach(function () {
        manager = new ClusterManager({
          master: master,
          worker: noop,
          numWorkers: numWorkers
        })
        sinon.stub(manager, 'createWorker', function () {
          manager.workers.push({ id: 'id' })
        })
      })

      it('should apply a domain to the cluster manager', function (done) {
        sinon.stub(manager.options, 'master', function () {
          assert.ok(manager.domain)
          manager.options.master.restore()
          done()
        })
        manager._startMaster()
      })

      it('should bind the appropriate events on `cluster`', function (done) {
        sinon.stub(manager.options, 'master', function () {
          manager.options.master.restore()
          assert.equal(spy.callCount, events.length)
          events.forEach(function (name) {
            sinon.assert.calledWith(spy, name)
          })
          done()
        })
        var events = ['fork', 'online', 'listening', 'disconnect', 'exit']
        var spy = sinon.spy(manager.cluster, 'on')
        manager._startMaster()
      })

      it('should start the appropriate number of workers', function (done) {
        sinon.stub(manager.options, 'master', function () {
          assert.equal(manager.workers.length, numWorkers)
          manager.options.master.restore()
          done()
        })
        manager._startMaster()
      })

      it('should call the master callback', function (done) {
        sinon.stub(manager.options, 'master', function () {
          sinon.assert.calledOnce(manager.options.master)
          manager.options.master.restore()
          done()
        })
        manager._startMaster()
      })

      it('should not log a warning if number of workers specified', function (done) {
        sinon.stub(manager.options, 'master', function () {
          assert.notOk(spy.calledWith('Number of workers not specified, using default.'))
          done()
        })
        var spy = sinon.spy(manager.log, 'warning')
        manager._startMaster()
      })

      it('should log a warning if not given a number of workers', function () {
        var envClusterWorkers = process.env.CLUSTER_WORKERS
        delete process.env.CLUSTER_WORKERS
        var manager = new ClusterManager(noop)
        sinon.stub(manager, 'createWorker')
        var spy = sinon.spy(manager.log, 'warning')
        manager._startMaster()
        sinon.assert.calledWith(spy, 'Number of workers not specified, using default.')
        process.env.CLUSTER_WORKERS = envClusterWorkers
      })
    }) // end '_startMaster'

    describe('_exitMaster', function () {
      beforeEach(function () {
        sinon.stub(process, 'exit')
      })

      afterEach(function () {
        process.exit.restore()
      })

      it('should execute the `beforeExit` callback', function (done) {
        var manager = new ClusterManager({
          worker: noop,
          beforeExit: function (err, done) { // eslint-disable-line handle-callback-err
            done()
          }
        })
        var spy = sinon.spy(manager.options, 'beforeExit')
        var err = new Error('Error')
        manager._exitMaster(err)
        sinon.assert.calledOnce(spy)
        sinon.assert.calledWith(spy, err)
        done()
      })

      it('should exit the process with code 1 when given an error', function () {
        var manager = new ClusterManager(noop)
        manager._exitMaster(new Error('error'))
        sinon.assert.calledOnce(process.exit)
        sinon.assert.calledWith(process.exit, 1)
      })

      it('should exit the process with code 0 when not given an error', function () {
        var manager = new ClusterManager(noop)
        manager._exitMaster()
        sinon.assert.calledOnce(process.exit)
        sinon.assert.calledWith(process.exit, 0)
      })
    }) // end '_exitMaster'

    describe('_startWorker', function () {
      it('should call the worker callback', function () {
        var manager = new ClusterManager(noop)
        var spy = sinon.spy(manager.options, 'worker')
        manager._startWorker()
        sinon.assert.calledWith(spy, manager)
        manager.options.worker.restore()
      })
    }) // end '_startWorker'

    describe('createWorker', function () {
      var manager

      beforeEach(function () {
        manager = new ClusterManager(noop)
        var nextId = 0
        sinon.stub(manager.cluster, 'fork', function () {
          var worker = new EventEmitter()
          worker.id = ++nextId
          worker.process = {
            kill: noop
          }
          return worker
        })
      })

      afterEach(function () {
        manager.cluster.fork.restore()
      })

      it('should fork a new worker', function () {
        manager.createWorker()
        sinon.assert.calledOnce(manager.cluster.fork)
      })

      it('should set a domain for the worker', function () {
        var worker = manager.createWorker()
        assert.ok(worker.domain)
      })

      it('should kill a worker if there was an unhandled error', function () {
        var worker = manager.createWorker()
        var spy = sinon.spy(worker.process, 'kill')
        var error = new Error('error')
        worker.emit('error', error)
        sinon.assert.calledWith(spy, 1)
        worker.process.kill.restore()
      })

      it('it should indicate an unhandled worker error in the logs', function () {
        var worker = manager.createWorker()
        var spy = sinon.spy(manager.log, 'error')
        var error = new Error('error')
        worker.emit('error', error)
        sinon.assert.calledOnce(spy)
        manager.log.error.restore()
      })

      it('should add the worker to the set of workers', function () {
        var spy = sinon.spy(manager.workers, 'push')
        var worker = manager.createWorker()
        sinon.assert.calledWith(spy, worker)
        manager.workers.push.restore()
      })

      it('should indicate a worker has been created in the logs', function () {
        var spy = sinon.spy(manager.log, 'info')
        manager.createWorker()
        sinon.assert.calledOnce(spy)
        manager.log.info.restore()
      })
    }) // end 'createWorker'
  })
})
