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

The backend restarts automatically (via [nodemon](https://nodemon.io)) whenever you save changes to `.js` or `.json` files in `src/backend/`, `src/models/`, `src/views/`, or `src/client/`. Static assets (`src/client/assets/`) do not trigger a restart. Page autoreload is not available because we avoid using JavaScript in the browser — reload the page manually to display your changes.

