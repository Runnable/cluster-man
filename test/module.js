'use strict'

var assert = require('chai').assert

require('loadenv')('cluster-man')
var ClusterManager = require('../index.js')

describe('cluster-man', function () {
  describe('module', function () {
    it('should expose the ClusterManager class', function () {
      assert.ok(ClusterManager)
      assert.isFunction(ClusterManager)
    })
  }) // end 'module'
}) // end 'cluster-man'
