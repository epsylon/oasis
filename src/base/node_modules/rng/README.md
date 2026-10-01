# Random [![build status](https://secure.travis-ci.org/jhermsmeier/rng.js.png)](http://travis-ci.org/jhermsmeier/rng.js) [![NPM version](https://badge.fury.io/js/rng.png)](https://npmjs.org/rng) [![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/jhermsmeier/rng.js/trend.png)](https://bitdeli.com/free "Bitdeli Badge")


## Install via [npm](https://npmjs.org/)

```shell
$ npm install rng
```


## Install via [component](http://github.com/component/)

```shell
$ component install jhermsmeier/rng.js
```


## Install via [bower](http://twitter.github.com/bower/)

```shell
$ bower install rng
```


## Usage

### Node.js

```javascript
// Require the module
var Random = require( 'rng' )
// Instantiate a new Mersenne Twister with a seed
var mt = new Random.MT( seed )
// ...
```


### Browser

```html
<!-- Required -->
<script src="path/to/rng/rng.js"></script>
<!-- Optionals, only load what you need -->
<script src="path/to/rng/lib/mersenne-twister.js"></script>
<script src="path/to/rng/lib/park-miller.js"></script>
<script src="path/to/rng/lib/....js"></script>
```

```javascript
// RNG.js exports the global `Random`, so you're good to go.
// Instantiate a new Mersenne Twister with a seed
var mt = new Random.MT( seed )
```


## API

### Class: `RNG()`
Base class using `Math.random()` as PRNG.
All other classes inherit from `RNG()`.

#### Methods

**Number `next()`**
Get a random byte [0,255]

**Number `random()`**
Same as `uniform()`, just to be compatible with the `Math.random()` style API

**Number `uniform()`**
Get a uniform random number between 0 and 1

**Number `normal()`**
Get normally distributed number, with a mean 0, variance 1

**Number `range( min, max )`**
Get random integer in range [min,max]

**Number `exp()`**
Get exponentionally distributed number with lambda 1

**Number `poisson( mean )`**
Get poisson distributed number, the mean defaulting to 1

**Number `gaussian( a )`**
Get gamma distributed number, using uniform, normal and exp with the Marsaglia-Tsang method


## Algorithms

### Class: `RNG.MT( seed )` - *Mersenne Twister*
### Class: `RNG.PM( seed )` - *Park-Miller*
### Class: `RNG.XOR( x, y, z, w )` - *XOR Shift*


#### Not (yet?) implemented:

- **ISAAC** - *ISAAC (indirection, shift, accumulate, add, count)*
- **MWC** - *Multiply-With-Carry*
- **CMWC** - *Complementary-Multiply-With-Carry*
- **LCG** - *Linear Congruential Generator*
- **ICG** - *Inversive Congruential Generator*
- **LFG** - *Lagged Fibonacci Generator*
- **LFSR** - *Linear Feedback Shift Register*
- **NRPF** - *Naor-Reingold Pseudorandom Function*
- **BBS** - *Blum Blum Shub*
