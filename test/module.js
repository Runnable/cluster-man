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
  describe('module', function () {
    it('should expose the ClusterManager class', function (done) {
      expect(ClusterManager).to.exist();
      expect(typeof ClusterManager).to.equal('function');
      done();
    });
  }); // end 'module'
}); // end 'cluster-man'
