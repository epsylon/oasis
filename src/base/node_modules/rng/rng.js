function Random() {
  this._normal = null
}

Random.prototype = {
  
  constructor: Random,
  
  get seed() {
    return this._seed
  },
  
  /**
   * Sets the seed, resets the state
   * @param  {Number} value
   * @return {Number} value
   */
  set seed( value ) {
    this.constructor.call( this, value )
  },
  
  /**
   * Get next random byte [0,255]
   * @return {Number}
   */
  next: function() {
    return 0 | ( this.uniform() * 255 )
  },
  
  /**
   * Same as #uniform(), just to be
   * compatible with the Math.random() style API
   * @return {Number}
   */
  random: function() {
    return this.uniform()
  },
  
  /**
   * Get uniform random number between 0 and 1
   * @return {Number}
   */
  uniform: function() {
    return Math.random()
  },
  
  /**
   * Get normally distributed number,
   * with a mean 0, variance 1
   * @return {Number}
   */
  normal: function() {
    
    var x, y
    
    if( this._normal != null ) {
      var num = this._normal
      this._normal = null
      return num
    }
    
    x = this.uniform() || Math.pow( 2, -53 )
    x = Math.sqrt( -2 * Math.log(x) )
    y = 2 * Math.PI * this.uniform()
    
    this._normal = x * Math.sin( y )
    return x * Math.cos( y )
    
  },
  
  /**
   * Get random integer in range [min,max]
   * @param  {Number} min
   * @param  {Number} max
   * @return {Number} 
   */
  range: function( min, max ) {
    
    if( min == null ) {
      return this.uniform()
    } else if( max == null ) {
      max = min
      min = 0
    }
    
    return min + Math.floor( this.uniform() * ( max - min ))
    
  },
  
  /**
   * Get exponentionally distributed
   * number with lambda 1
   * @return {Number}
   */
  exp: function() {
    return -Math.log(
      this.uniform() || Math.pow( 2, -53 )
    )
  },
  
  /**
   * Get poisson distributed number,
   * the mean defaulting to 1
   * @param  {Number} mean
   * @return {Number} 
   */
  poisson: function( mean ) {
    
    var L = Math.exp( -( mean || 1 ) )
    var k = 0, p = 1
    
    while( p > L ) {
      p = p * this.uniform()
      k++
    }
    
    return k - 1
    
  },
  
  /**
   * Get gamma distributed number,
   * using uniform, normal and exp
   * with the Marsaglia-Tsang method
   * @param  {Number} a gamma
   * @return {Number} 
   */
  gamma: function( a ) {
    
    var d, c, x, u, v
    
    d = ( a < 1 ? 1 + a : a ) - 1/3
    c = 1 / Math.sqrt( 9 * d )
    
    while( true ) {
      while( true ) {
        x = this.normal()
        v = Math.pow( 1 + c * x, 3 )
        if( v > 0 ) break
      }
      u = this.uniform()
      if( u >= 1 - 0.331 * Math.pow( x, 4 ) ) {
        if( Math.log(u) >= 0.5 * Math.pow( x, 2 ) + d * ( 1 - v + Math.log(v) ) ) {
          break
        }
      }
    }
    
    return a > 1 ? d * v :
      d * v * Math.exp( this.exp() / -a )
    
  }
  
}

if( typeof module !== 'undefined' ) {
  
  module.exports = Random
  
  if( typeof require === 'function' ) {
    Random.MT = require( './lib/mersenne-twister' )
    Random.PM = require( './lib/park-miller' )
    Random.XOR = require( './lib/xor' )
  }
  
}
