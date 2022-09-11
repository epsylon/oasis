# Architecture

```
├── assets: static assets like CSS
├── cli:    command-line interface (yargs)
├── http:   HTTP interface (koa)
├── index:  mediator that ties everything together
├── models: data sources
├── ssb:    SSB connection and interfaces
└── views:  HTML presentation to be exposed over HTTP
```

## Debugging

Debugging is never going to be easy, but the debug script helps a bit. You can
use `oasis --debug` or debug the source with `npm run debug` / `yarn debug`.

