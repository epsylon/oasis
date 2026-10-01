function Queue (initial = []) {
  this.q = Array.from(initial)
}

Queue.prototype.add = function (el) { this.q.push(el) }
Queue.prototype.next = function () { return this.q.shift() }
Queue.prototype.isEmpty = function () { return this.q.length === 0 }

module.exports = Queue
