'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var beforeEach = lab.beforeEach
var afterEach = lab.afterEach
var Code = require('code')
var expect = Code.expect
var sinon = require('sinon')
var noop = require('101/noop')

require('loadenv')('cluster-man')
var ClusterManager = require('../index.js')

describe('cluster-man', function () {
  describe('events', function () {
    var manager
    var infoSpy
    var numWorkers = 4

    beforeEach(function (done) {
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
      done()
    })

    afterEach(function (done) {
      manager.cluster.fork.restore()
      manager.log.info.restore()
      manager.cluster.removeAllListeners()
      done()
    })

    describe('fork', function () {
      it('should call `fork` when a worker is forked', function (done) {
        var worker = manager.workers[0]
        var spy = sinon.spy(manager, 'fork')
        manager.cluster.emit('fork', worker)
        expect(spy.calledWith(worker)).to.be.true()
        manager.fork.restore()
        done()
      })

      it('should indicate a worker fork in the logs', function (done) {
        var worker = manager.workers[0]
        manager.cluster.emit('fork', worker)
        expect(infoSpy.calledWith('Worker forked: ' + worker.id)).to.be.true()
        done()
      })
    }) // end 'fork'

    describe('listening', function () {
      it('should call `listening` when a worker is listening', function (done) {
        var worker = manager.workers[0]
        var address = { address: '0.0.0.0', port: '9000' }
        var spy = sinon.spy(manager, 'listening')
        manager.cluster.emit('listening', worker, address)
        expect(spy.calledWith(worker, address)).to.be.true()
        manager.listening.restore()
        done()
      })

      it('should indicate a worker is listening in the logs', function (done) {
        var worker = manager.workers[0]
        var address = { address: '0.0.0.0', port: '9000' }
        var logLine = 'Worker listening: ' + worker.id +
          ' on address ' + address.address + ':' + address.port

        manager.cluster.emit('listening', worker, address)
        expect(infoSpy.calledWith(logLine)).to.be.true()
        done()
      })
    }) // end 'listening'

    describe('exit', function () {
      it('should call `exit` when a worker exits', function (done) {
        var worker = manager.workers[0]
        var code = 1
        var signal = 'SIGBUS'
        var spy = sinon.spy(manager, 'exit')
        manager.cluster.emit('exit', worker, code, signal)
        expect(spy.calledWith(worker, code, signal)).to.be.true()
        manager.exit.restore()
        done()
      })

      it('should indicate a worker exit in the logs', function (done) {
        var worker = manager.workers[0]
        var code = 0
        var signal = 'SIGINT'
        var logLine = 'Worker exited: ' + worker.id +
          ' -- with status: ' + code +
          ' -- and signal: ' + signal

        manager.cluster.emit('exit', worker, code, signal)
        expect(infoSpy.calledWith(logLine)).to.be.true()
        done()
      })

      it('should remove a worker that exits', function (done) {
        var worker = manager.workers[0]
        var code = 0
        var signal = 'SIGINT'
        manager.cluster.emit('exit', worker, code, signal)
        expect(manager.workers.length).to.equal(numWorkers - 1)
        manager.workers.forEach(function (w) {
          expect(w.id).to.not.equal(worker.id)
        })
        done()
      })

      it('should exit the master process if all workers exit', function (done) {
        var stub = sinon.stub(manager, '_exitMaster')
        var log = sinon.spy(manager.log, 'error')

        // Need to indirectly iterate over the workers, since `manager.workers`
        // is modified by the 'exit' event handler
        manager.workers.map(function (worker) {
          return worker
        }).forEach(function (worker) {
          manager.cluster.emit('exit', worker, 1, 'SIGINT')
        })

        expect(stub.calledOnce)
          .to.be.true()
        expect(stub.calledWithMatch({ message: 'All workers have died.' }))
          .to.be.true()
        expect(log.calledWithMatch('Cluster fatal'))
          .to.be.true()

        manager._exitMaster.restore()
        done()
      })
    }) // end 'exit'

    describe('online', function () {
      it('should call `online` when a worker goes online', function (done) {
        var worker = manager.workers[0]
        var spy = sinon.spy(manager, 'online')
        manager.cluster.emit('online', worker)
        expect(spy.calledWith(worker)).to.be.true()
        manager.online.restore()
        done()
      })

      it('should indicate a worker has gone online in the logs', function (done) {
        var worker = manager.workers[0]
        manager.cluster.emit('online', worker)
        expect(infoSpy.calledWith('Worker online: ' + worker.id)).to.be.true()
        done()
      })
    }) // end 'online'

    describe('disconnect', function () {
      it('should call `disconnect` when a worker disconnects', function (done) {
        var worker = manager.workers[0]
        var spy = sinon.spy(manager, 'disconnect')
        manager.cluster.emit('disconnect', worker)
        expect(spy.calledWith(worker)).to.be.true()
        manager.disconnect.restore()
        done()
      })

      it('should indicate a worker has disconnected in the logs', function (done) {
        var worker = manager.workers[0]
        var logLine = 'Worker disconnected: ' + worker.id + ' -- killing'
        manager.cluster.emit('disconnect', worker)
        expect(infoSpy.calledWith(logLine)).to.be.true()
        done()
      })
    }) // end 'disconnect'
  }) // end 'events'

  describe('masterError', function () {
    var manager
    var errorObject = new Error('Unhandled Error')

    beforeEach(function (done) {
      manager = new ClusterManager({
        worker: noop,
        master: function () {
          throw errorObject
        },
        numWorkers: 1
      })
      sinon.stub(manager.cluster, 'fork').returns({ id: 'id' })
      done()
    })

    afterEach(function (done) {
      manager.cluster.fork.restore()
      done()
    })

    it('should call `masterError` on an uncaught master process error', function (done) {
      sinon.stub(manager, 'masterError', function (err) {
        expect(err).to.equal(errorObject)
        manager.masterError.restore()
        done()
      })
      manager._startMaster()
    })

    it('should log uncaught errors on the master process', function (done) {
      var spy = sinon.spy(manager.log, 'error')
      sinon.stub(process, 'exit', function () {
        expect(spy.calledTwice).to.be.true()
        manager.log.error.restore()
        process.exit.restore()
        done()
      })
      manager._startMaster()
    })

    it('should exit the master process on uncaught errors', function (done) {
      sinon.stub(manager, '_exitMaster', function (err) {
        expect(err).to.equal(errorObject)
        done()
      })
      manager._startMaster()
    })

    it('should not exit the master process when `killOnError === false`', function (done) {
      var manager = new ClusterManager({
        worker: noop,
        killOnError: false
      })
      var stub = sinon.stub(manager, '_exitMaster')
      manager.masterError(new Error('Error'))
      expect(stub.callCount).to.equal(0)
      done()
    })
  }) // end 'masterError'
}) // end 'cluster-man'
