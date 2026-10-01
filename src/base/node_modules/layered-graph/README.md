# layered-graph

Compose a graph out of multiple sublayers, and in particular, expose a
dynamically updating shortest paths calculation.

Later added layers override earlier layers.

## API: LayeredGraph({start, max}) => layers

`start` is a node id that is the "root" of the graph.
hops are [calculated](https://github.com/dominictarr/dynamic-dijkstra) from this node.
`max` is a float that is the maximum path length to include in the hops calculation.

### layers.createLayer (name) => add(g) || add(from, to, value)

create a layer in this graph. returns an `add` function.
The add function should be called with an initial graph,
and then new edges. Each layer must be initialized.
`add({})` is a valid initialization, which is adding an empty graph.
`add(a, b, 1)` would be adding a single edge with weight 1 between a and b.

## layers.getGraph() => g

returns the current layered graph merged into one layer.
the graph is just a two level js object {}, structure `{<id_a>:{<id_b>: <weight>},...}`

### layers.getHops(opts?) => {<id>: <hops>}

return a hops map, of each peer id, to their hop length from `start` (passed to constructor)
If `opts` is provided, it accepts the following fields:
`reverse`: return hops _to_ `start` instead of from `start`.
`start`: calculate hops from/to a different node.
`max`: set a different max distance.
If the `max` is smaller than the default passed to the constructor, the output will be fastest,
because it will just copy the cached value, but skip nodes at a greater distance than `max`.


### layers.hopStream() => Source

returns a pull-stream source, where each message is a hops object (as returned by getHops)
the first item will be the current state, and any subsequent objects will be diffs to that object,
created by edges being added or removed in some layer in real time.

### layers.onReady (fn)

call `fn` back once all layers have been initialized, or immediately if they are already initialized.

### layers.onEdge (fn(from, to, value))

call `fn` when an edge is added or removed from the graph.

### layers.reset()

Clear the state held by this instance, basically going back to how things were
when you called `LayeredGraph({start, max})`.

## License

MIT


