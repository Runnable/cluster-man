'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var Code = require('code');
var expect = Code.expect;
var sinon = require('sinon');
var noop = require('101/noop');
var os = require('os');
var debug = require('debug');
var EventEmitter = require('events').EventEmitter;

require('loadenv')('cluster-man');
var ClusterManager = require('../index.js');

describe('cluster-man', function () {
  describe('methods', function () {
    describe('constructor', function (done) {
      it('should throw an execption if worker function is missing', function (done) {
        expect(function() {
          new ClusterManager();
        }).to.throw(Error, 'Cluster must be provided with a worker closure.');
        expect(function() {
          new ClusterManager({ master: function() {} });
        }).to.throw(Error, 'Cluster must be provided with a worker closure.');
        done();
      });

      it('should correctly assign a worker function', function (done) {
        var manager = new ClusterManager({ worker: noop });
        expect(manager.options.worker).to.equal(noop);
        done();
      });

      it('should allow construction with only the worker function', function (done) {
        var manager = new ClusterManager(noop);
        expect(manager.options.worker).to.equal(noop);
        done();
      });

      it('should default the master callback to noop', function (done) {
        var manager = new ClusterManager(function() { return 'worker'; });
        expect(manager.options.master).to.equal(noop);
        done();
      });

      it('should set the master function based on passed options', function (done) {
        var master = function() { return 'master'; };
        var manager = new ClusterManager({
          worker: noop,
          master: master
        });
        expect(manager.options.master).to.equal(master);
        done();
      });

      it('should use `CLUSTER_WORKERS` for `numWorkers`', function (done) {
        var manager = new ClusterManager(noop);
        expect(manager.options.numWorkers).to.equal(process.env.CLUSTER_WORKERS);
        done();
      });

      it('should use # of CPUs for `numWorkers` if `CLUSTER_WORKERS` is missing', function (done) {
        var envClusterWorkers = process.env.CLUSTER_WORKERS;
        delete process.env.CLUSTER_WORKERS;
        var manager = new ClusterManager(noop);
        expect(manager.options.numWorkers).to.equal(os.cpus().length);
        process.env.CLUSTER_WORKERS = envClusterWorkers;
        done();
      });

      it('should set `numWorkers` based on passed option', function (done) {
        var workers = 1337;
        var manager = new ClusterManager({ worker: noop, numWorkers: workers });
        expect(manager.options.numWorkers).to.equal(workers);
        done();
      });

      it('should use `CLUSTER_DEBUG` by default for debug scope', function(done) {
        var scope = process.env.CLUSTER_DEBUG;
        var spy = sinon.spy(ClusterManager.prototype, '_addLogger');
        var manager = new ClusterManager(noop);
        expect(spy.calledWith('info', scope + ':info')).to.be.true();
        expect(spy.calledWith('warning', scope + ':warning')).to.be.true();
        expect(spy.calledWith('error', scope + ':error')).to.be.true();
        ClusterManager.prototype._addLogger.restore();
        done();
      });

      it('should use `cluster-man` as a debug scope if `CLUSTER_DEBUG` is missing', function (done) {
        var envClusterDebug = process.env.CLUSTER_DEBUG;
        delete process.env.CLUSTER_DEBUG;
        var scope = 'cluster-man';
        var spy = sinon.spy(ClusterManager.prototype, '_addLogger');
        var manager = new ClusterManager(noop);
        expect(spy.calledWith('info', scope + ':info')).to.be.true();
        expect(spy.calledWith('warning', scope + ':warning')).to.be.true();
        expect(spy.calledWith('error', scope + ':error')).to.be.true();
        process.env.CLUSTER_DEBUG = envClusterDebug;
        ClusterManager.prototype._addLogger.restore();
        done();
      });

      it('should set debug scope based on passed options', function (done) {
        var scope = 'custom-scope';
        var spy = sinon.spy(ClusterManager.prototype, '_addLogger');
        var manager = new ClusterManager({
          worker: noop,
          debugScope: scope
        });
        expect(spy.calledWith('info', scope + ':info')).to.be.true();
        expect(spy.calledWith('warning', scope + ':warning')).to.be.true();
        expect(spy.calledWith('error', scope + ':error')).to.be.true();
        ClusterManager.prototype._addLogger.restore();
        done();
      });

      it('should set `killOnError` to true by default', function (done) {
        var manager = new ClusterManager(noop);
        expect(manager.options.killOnError).to.be.true();
        done();
      });

      it('should allow the user to set `killOnError` option', function (done) {
        var manager = new ClusterManager({
          worker: noop,
          killOnError: false
        });
        expect(manager.options.killOnError).to.be.false();
        done();
      });
    }); // end 'constructor'

    describe('_addLogger', function () {
      it('should add a logger to `this.log` with the appropriate name', function (done) {
        var manager = new ClusterManager(noop);
        var name = 'example';
        manager._addLogger(name, name);
        expect(manager.log[name]).to.exist();
        expect(typeof manager.log[name]).to.equal('function');
        done();
      });
    }); // end '_addLogger'

    describe('start', function() {
      var manager = new ClusterManager(noop);
      beforeEach(function (done) {
        sinon.stub(manager, '_startMaster');
        sinon.stub(manager, '_startWorker');
        done();
      });

      afterEach(function (done) {
        manager._startMaster.restore();
        manager._startWorker.restore();
        done();
      });

      it('should start master if in the master process', function (done) {
        manager.cluster = { isMaster: true };
        manager.start();
        expect(manager._startMaster.calledOnce).to.be.true();
        expect(manager._startWorker.callCount).to.equal(0);
        done();
      });

      it('should start a worker if in a worker process', function (done) {
        manager.cluster = { isMaster: false };
        manager.start();
        expect(manager._startWorker.calledOnce).to.be.true();
        expect(manager._startMaster.callCount).to.equal(0);
        done();
      });
    }); // end 'start'

    describe('_startMaster', function () {
      var manager;
      var numWorkers = 3;
      var master = function() { return 'master'; };

      beforeEach(function (done) {
        manager = new ClusterManager({
          master: master,
          worker: noop,
          numWorkers: numWorkers
        });
        sinon.stub(manager, 'createWorker', function () {
          manager.workers.push({ id: 'id' });
        });
        done();
      });

      it('should apply a domain to the cluster manager', function (done) {
        manager._startMaster();
        expect(manager.domain).to.exist();
        done();
      });

      it('should bind the appropriate events on `cluster`', function (done) {
        var events = ['fork', 'online', 'listening', 'disconnect', 'exit'];
        var spy = sinon.spy(manager.cluster, 'on');
        manager._startMaster();
        expect(spy.callCount).to.equal(events.length);
        events.forEach(function (name) {
          expect(spy.calledWith(name)).to.be.true();
        });
        done();
      });

      it('should start the appropriate number of workers', function (done) {
        manager._startMaster();
        expect(manager.workers.length).to.equal(numWorkers);
        done();
      });

      it('should call the master callback', function (done) {
        var spy = sinon.spy(manager.options, 'master');
        manager._startMaster();
        expect(spy.calledOnce).to.be.true();
        manager.options.master.restore();
        done();
      });
    }); // end '_startMaster'

    describe('_startWorker', function () {
      it('should call the worker callback', function (done) {
        var manager = new ClusterManager(noop);
        var spy = sinon.spy(manager.options, 'worker');
        manager._startWorker();
        expect(spy.calledWith(manager)).to.be.true();
        manager.options.worker.restore();
        done();
      });
    }); // end '_startWorker'

    describe('createWorker', function () {
      var manager;

      beforeEach(function (done) {
        manager = new ClusterManager(noop);
        var nextId = 0;
        sinon.stub(manager.cluster, 'fork', function () {
          var worker = new EventEmitter();
          worker.id = ++nextId;
          worker.process = {
            kill: noop
          };
          return worker;
        });
        done();
      });

      afterEach(function (done) {
        manager.cluster.fork.restore();
        done();
      });

      it('should fork a new worker', function (done) {
        manager.createWorker();
        expect(manager.cluster.fork.calledOnce).to.be.true();
        done();
      });

      it('should set a domain for the worker', function (done) {
        var worker = manager.createWorker();
        expect(worker.domain).to.exist();
        done();
      });

      it('should kill a worker if there was an unhandled error', function (done) {
        var worker = manager.createWorker();
        var spy = sinon.spy(worker.process, 'kill');
        var error = new Error('error');
        worker.emit('error', error);
        expect(spy.calledWith(1)).to.be.true();
        worker.process.kill.restore();
        done();
      });

      it('it should indicate an unhandled worker error in the logs', function (done) {
        var worker = manager.createWorker();
        var spy = sinon.spy(manager.log, 'error');
        var error = new Error('error');
        worker.emit('error', error);
        expect(spy.calledOnce).to.be.true();
        manager.log.error.restore();
        done();
      });

      it('should add the worker to the set of workers', function (done) {
        var spy = sinon.spy(manager.workers, 'push');
        var worker = manager.createWorker();
        expect(spy.calledWith(worker)).to.be.true();
        manager.workers.push.restore();
        done();
      });

      it('should indicate a worker has been created in the logs', function (done) {
        var spy = sinon.spy(manager.log, 'info');
        manager.createWorker();
        expect(spy.calledOnce).to.be.true();
        manager.log.info.restore();
        done();
      });
    }); // end 'createWorker'
  });
});
