# Developer Install

To deploy the development environment:

```shell
git clone https://code.03c8.net/KrakensLab/oasis
cd oasis
bash install.sh
cd src/server
npm run dev
```

Once Oasis is started in dev mode, visit [http://localhost:3000](http://localhost:3000). 

While the server processes are running, they will restart theirselves automatically every time you save changes in any file into `/src`. Page autoreload feature is not available even for the development environment because we avoid using JavaScript in the browser, so your browser will remain untouched. Reload the page manually to display the changes.

