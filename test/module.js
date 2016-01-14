'use strict'

var Lab = require('lab')
var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var Code = require('code')
var expect = Code.expect

require('loadenv')('cluster-man')
var ClusterManager = require('../index.js')

describe('cluster-man', function () {
  describe('module', function () {
    it('should expose the ClusterManager class', function (done) {
      expect(ClusterManager).to.exist()
      expect(typeof ClusterManager).to.equal('function')
      done()
    })
  }) // end 'module'
}) // end 'cluster-man'
