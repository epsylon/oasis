const test = require('tape');
const SecretStack = require('secret-stack');
import {plugin, muxrpc} from './index';

test('can create a class-based plugin for secret-stack', (t: any) => {
  t.plan(8);

  @plugin('1.2.3')
  class database {
    private api: any;

    constructor(api: any, config: any) {
      t.ok(api, 'class constructor gets 1st argument: api');
      t.ok(config, 'class constructor gets 2nd argument: config');
      this.api = api;
    }

    @muxrpc('sync')
    store = (x: any) => {
      return x * 10;
    };

    @muxrpc('sync')
    getAPI = () => {
      return this.api;
    };

    @muxrpc('sync')
    public getAPI2() {
      return this.api;
    };

  }

  var App = SecretStack({
    appKey: '1KHLiKZvAvjbY1ziZEHMXawbCEIM6qwjCDm3VYRan/s=',
  }).use(database);

  var app = App({});

  t.ok(app.database, 'our plugin exists in the resulting api');
  t.ok(app.database.store, 'our plugin method exists in the resulting api');
  t.equals(app.database.store(2), 20, 'our plugin method works as expected');
  t.equals(app.database.getAPI(), app, 'our plugin instance method is running in correct context');
  t.equals(app.database.getAPI2(), app, 'our plugin prototype method is running in correct context');
  t.equals(app.database.api, undefined, 'our plugin private attribute is hidden');

  app.close();
  t.end();
});
