var zerr = require('zerr')
var pull = require('pull-stream')

module.exports = function (addedValidators) {
  var api = {}
  var validators = {}

  // validator control
  api.get = function (name) {
    return validators[name]
  }
  api.set = function (name, fn) {
    if (name && typeof name == 'object')
      for (var k in name) 
        api.set(k, name[k].bind(api))
    else
      validators[name] = fn
  }

  // set validator registry
  api.set({
    number: function (param, n) {
      var asNum = +param
      if (isNaN(asNum) || asNum != param)
        return 'type'
    },
    string: function (param, n) {
      var asString = ''+param
      if (asString != param)
        return 'type'
    },
    boolean: function (param, n) {
      if (typeof param != 'boolean')
        return 'type'
    },
    object: function (param, n) {
      if (typeof param != 'object' || !param)
        return 'type'
    },
    array: function (param, n) {
      if (!Array.isArray(param))
        return 'type'
    },
    function: function (param, n) {
      if (typeof param != 'function')
        return 'type'
    }
  })
  api.set(addedValidators)

  // rpc method wrappers
  api.sync = function (fn) {
    var spec = Array.prototype.slice.call(arguments, 1)
    return function () {
      var args = Array.prototype.slice.call(arguments)

      // run validation
      var err = validate(args, spec)
      if (err) throw err

      // run sync fn
      return apply(this, fn, args)
    }
  }
  api.async = function (fn) {
    var spec = Array.prototype.slice.call(arguments, 1)
    var opts = (typeof spec[0] == 'object' && !Array.isArray(spec[0])) ? spec.shift() : {}
    return function () {
      var args = Array.prototype.slice.call(arguments)
      var hasCb = (typeof args[args.length - 1] == 'function')

      // cb validation
      if (!hasCb && !opts.cbOptional)
        throw errs.MissingCallback()

      // get cb
      var cb = (hasCb)
        ? args[args.length - 1]
        : function (err) { if (err) { throw err; } }

      // run validation
      var err = validate((hasCb) ? args.slice(0,args.length-1) : args, spec)
      if (err) return cb(err)

      // run async fn
      return apply(this, fn, args)
    }
  }
  api.source = function (fn) {
    var spec = Array.prototype.slice.call(arguments, 1)
    return function () {
      var args = Array.prototype.slice.call(arguments)

      // run validation
      var err = validate(args, spec)
      if (err) return pull.error(err)

      // run stream fn
      return apply(this, fn, args)
    }
  }
  api.sink = function (fn) {
    var spec = Array.prototype.slice.call(arguments, 1)
    return function () {
      var args = Array.prototype.slice.call(arguments)
      var hasCb = (typeof args[args.length - 1] == 'function')

      // get cb
      var cb = (hasCb)
        ? args[args.length - 1]
        : function (err) { if (err) { throw err; } }

      // run validation
      var err = validate((hasCb) ? args.slice(0,args.length-1) : args, spec)
      if (err) return cb(err)

      // run async fn
      return apply(this, fn, args)
    }
  }

  // run validation against a spec
  function validate (args, spec) {
    var err

    // multiple specs?
    if (Array.isArray(spec[0])) {
      for (var i=0; i < spec.length; i++) {
        err = validate(args, spec[i])
        if (!err)
          return false // spec passed
      }
      return err // give the last error
    }

    // iterate the spec
    for (var i=0; i < spec.length; i++) {
      var types = parse(spec[i])

      for (var j=0; j < types.length; j++) {
        var type = types[j]

        // falsey? or final cb?
        if (!args[i] || typeof args[i] === 'function') {
          err = (type.optional) ? false : errs.MissingParam(''+i)
          break
        }

        // get & run validator
        var validator = validators[type.name]
        if (!validator)
          throw new Error('Validator not found: ' + type.name)
        err = validator(args[i], ''+i)

        // did the validator pass? break out of this type
        if (!err)
          break

        // error aliases
        if (err == 'type')
          err = errs.Type(''+i, type.name)
      }

      // none of the types passed? return the error
      if (err)
        return err
    }
    return false
  }

  return api
}

var errs =
module.exports.errors = {
  MissingCallback: zerr('Usage', 'Callback parameter is required'),
  MissingParam: zerr('Usage', 'Param % is required'),
  Type: zerr('Type', 'Param % must by of type %')
}

// parse spec token
function parse (token) {
  return token.split('|').map(function (token) {
    if (token.charAt(token.length - 1) == '?')
      return { name: token.slice(0, token.length - 1), optional: true }
    return { name: token, optional: false }
  })
}

// helper to avoid apply, for performance
function apply (self, fn, args) {
  if (args.length == 0)
    return fn.call(self)
  if (args.length == 1)
    return fn.call(self, args[0])
  if (args.length == 2)
    return fn.call(self, args[0], args[1])
  if (args.length == 3)
    return fn.call(self, args[0], args[1], args[2])
  if (args.length == 4)
    return fn.call(self, args[0], args[1], args[2], args[3])
  return fn.apply(self, args)
}