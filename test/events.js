'use strict'

var assert = require('chai').assert
var noop = require('101/noop')
var sinon = require('sinon')

require('loadenv')()
var ClusterManager = require('../index.js')

describe('cluster-man', function () {
  describe('events', function () {
    var manager
    var infoSpy
    var numWorkers = 4

    beforeEach(function () {
      manager = new ClusterManager({
        worker: noop,
        numWorkers: numWorkers
      })
      var workerId = 0
      sinon.stub(manager.cluster, 'fork', function () {
        return { id: ++workerId }
      })
      infoSpy = sinon.spy(manager.log, 'info')
      manager._startMaster()
    })

    afterEach(function () {
      manager.cluster.fork.restore()
      manager.log.info.restore()
      manager.cluster.removeAllListeners()
    })

    describe('fork', function () {
      it('should call `fork` when a worker is forked', function () {
        var worker = manager.workers[0]
        var spy = sinon.spy(manager, 'fork')
        manager.cluster.emit('fork', worker)
        sinon.assert.calledWith(spy, worker)
        manager.fork.restore()
      })

      it('should indicate a worker fork in the logs', function () {
        var worker = manager.workers[0]
        manager.cluster.emit('fork', worker)
        sinon.assert.calledWith(infoSpy, 'Worker forked: ' + worker.id)
      })
    }) // end 'fork'

    describe('listening', function () {
      it('should call `listening` when a worker is listening', function () {
        var worker = manager.workers[0]
        var address = { address: '0.0.0.0', port: '9000' }
        var spy = sinon.spy(manager, 'listening')
        manager.cluster.emit('listening', worker, address)
        sinon.assert.calledWith(spy, worker, address)
        manager.listening.restore()
      })

      it('should indicate a worker is listening in the logs', function () {
        var worker = manager.workers[0]
        var address = { address: '0.0.0.0', port: '9000' }
        var logLine = 'Worker listening: ' + worker.id +
          ' on address ' + address.address + ':' + address.port

        manager.cluster.emit('listening', worker, address)
        sinon.assert.calledWith(infoSpy, logLine)
      })
    }) // end 'listening'

    describe('exit', function () {
      it('should call `exit` when a worker exits', function () {
        var worker = manager.workers[0]
        var code = 1
        var signal = 'SIGBUS'
        var spy = sinon.spy(manager, 'exit')
        manager.cluster.emit('exit', worker, code, signal)
        sinon.assert.calledWith(spy, worker, code, signal)
        manager.exit.restore()
      })

      it('should indicate a worker exit in the logs', function () {
        var worker = manager.workers[0]
        var code = 0
        var signal = 'SIGINT'
        var logLine = 'Worker exited: ' + worker.id +
          ' -- with status: ' + code +
          ' -- and signal: ' + signal

        manager.cluster.emit('exit', worker, code, signal)
        sinon.assert.calledWith(infoSpy, logLine)
      })

      it('should remove a worker that exits', function () {
        var worker = manager.workers[0]
        var code = 0
        var signal = 'SIGINT'
        manager.cluster.emit('exit', worker, code, signal)
        assert.equal(manager.workers.length, numWorkers - 1)
        manager.workers.forEach(function (w) {
          assert.notEqual(w.id, worker.id)
        })
      })

      it('should exit the master process if all workers exit', function () {
        var stub = sinon.stub(manager, '_exitMaster')
        var log = sinon.spy(manager.log, 'error')

        // Need to indirectly iterate over the workers, since `manager.workers`
        // is modified by the 'exit' event handler
        manager.workers.map(function (worker) {
          return worker
        }).forEach(function (worker) {
          manager.cluster.emit('exit', worker, 1, 'SIGINT')
        })

        sinon.assert.calledOnce(stub)
        sinon.assert.calledWithMatch(stub, { message: 'All workers have died.' })
        sinon.assert.calledWithMatch(log, 'Cluster fatal')

        manager._exitMaster.restore()
      })
    }) // end 'exit'

    describe('online', function () {
      it('should call `online` when a worker goes online', function () {
        var worker = manager.workers[0]
        var spy = sinon.spy(manager, 'online')
        manager.cluster.emit('online', worker)
        sinon.assert.calledWith(spy, worker)
        manager.online.restore()
      })

      it('should indicate a worker has gone online in the logs', function () {
        var worker = manager.workers[0]
        manager.cluster.emit('online', worker)
        sinon.assert.calledWith(infoSpy, 'Worker online: ' + worker.id)
      })
    }) // end 'online'

    describe('disconnect', function () {
      it('should call `disconnect` when a worker disconnects', function () {
        var worker = manager.workers[0]
        var spy = sinon.spy(manager, 'disconnect')
        manager.cluster.emit('disconnect', worker)
        sinon.assert.calledWith(spy, worker)
        manager.disconnect.restore()
      })

      it('should indicate a worker has disconnected in the logs', function () {
        var worker = manager.workers[0]
        var logLine = 'Worker disconnected: ' + worker.id + ' -- killing'
        manager.cluster.emit('disconnect', worker)
        sinon.assert.calledWith(infoSpy, logLine)
      })
    }) // end 'disconnect'
  }) // end 'events'

  describe('masterError', function () {
    var manager
    var errorObject = new Error('Unhandled Error')

    beforeEach(function () {
      manager = new ClusterManager({
        worker: noop,
        master: function () {
          throw errorObject
        },
        numWorkers: 1
      })
      sinon.stub(manager.cluster, 'fork').returns({ id: 'id' })
    })

    afterEach(function () {
      manager.cluster.fork.restore()
    })

    it('should call `masterError` on an uncaught master process error', function (done) {
      sinon.stub(manager, 'masterError', function (err) {
        assert.equal(err, errorObject)
        done()
      })
      manager._startMaster()
    })

    it('should log uncaught errors on the master process', function () {
      var spy = sinon.spy(manager.log, 'error')
      sinon.stub(process, 'exit', function () {
        sinon.assert.calledTwice(spy)
        manager.log.error.restore()
        process.exit.restore()
      })
      manager._startMaster()
    })

    it('should exit the master process on uncaught errors', function () {
      sinon.stub(manager, '_exitMaster', function (err) {
        assert.equal(err, errorObject)
      })
      manager._startMaster()
    })

    it('should not exit the master process when `killOnError === false`', function () {
      var manager = new ClusterManager({
        worker: noop,
        killOnError: false
      })
      var stub = sinon.stub(manager, '_exitMaster')
      manager.masterError(new Error('Error'))
      sinon.assert.notCalled(stub)
    })
  }) // end 'masterError'
}) // end 'cluster-man'
