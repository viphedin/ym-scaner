const app = require('express')();
const basicAuth = require('express-basic-auth');
const ipfilter = require('express-ipfilter').IpFilter;
const IpDeniedError = require('express-ipfilter').IpDeniedError;
const http = require('http').createServer(app);
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const config = require(path.resolve(__dirname, '../config.json'));

console.log(config);

const baseUrl = config.url;

let STORAGE = [];

let BROWSERS = [];

const BROWSERS_COUNT = config.browsers;

let lastFreeTime = new Date();

async function ymSearch(query, num, key) {
  let browser = await getBrowser(num);

  let prefix = path.resolve(__dirname, '../logs') + '/' + key + '_';

  const page = browser.page;

  let category = '';
  let match = query.match(/\[\:(.+)\:\]/);

  if (match) {
    category = match[1];
    query = query.replace(/\[\:.+\:\]/, '');
  }

  let bodyHTML = '';

  try {
    //await page.screenshot({path: prefix + 'page0.png', fullPage: true});

    const input = await page.$('#header-search');
    await input.click({ clickCount: 3 })
    await input.type(query);

    //await page.screenshot({path: prefix + 'market1.png'});

    console.log('search: ', query);

    await page.click('button[type="submit"]');

    //await page.screenshot({path: prefix + 'page1.png', fullPage: true});

    try {
      try {
        await page.waitForSelector('a.n-filter-sorter__link', { timeout: 1000 });
        await page.click('a.n-filter-sorter__link');
      } catch (error) {
        console.log("sort didn't appear.")
      }

      try {
        await page.waitForSelector('h3.n-snippet-card2__title', { timeout: 1000 });
      } catch (error) {
        console.log("empty page.")
      }

      if (config.debug) {
        await page.screenshot({path: prefix + 'results.png'});
      }

      bodyHTML += await page.evaluate(() => document.body.innerHTML);

      try {
        await page.waitForSelector('a.n-pager__button-next', { timeout: 1000 });
        await page.click('a.n-pager__button-next');

        if (category) {
          try {
            const linkHandlers = await page.$x('//div[contains(text(), "' + category + '")]');

            if (linkHandlers.length > 0) {
              await linkHandlers[0].click();
              console.log('category selected');
            } else {
              throw new Error("Link not found");
            }

            await page.waitForSelector('h3.n-snippet-card2__title', { timeout: 2000 });
          } catch (error) {
            console.log("category not clicked", error);
          }
        }

        //await page.screenshot({path: prefix + 'market3.png'});

        bodyHTML += await page.evaluate(() => document.body.innerHTML);
      } catch (error) {
        console.log("next page didn't appear.")
      }
    } catch (error) {
      console.log('error: ' + error.message);

      save('./result.html', await page.evaluate(() => document.body.innerHTML));
    }
  } catch (error) {
    console.log('message: ' + error.message);
  }

  browser.free = true;

  lastFreeTime = new Date();

  return bodyHTML;
}

function getKey() {
  return (Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).toUpperCase();
}

function cleanStorage() {
  let date = new Date();
  date.setMinutes(date.getMinutes() - 10);

  for (let i in STORAGE) {
    if (STORAGE[i].html && date > STORAGE[i].date) {
      delete STORAGE[i];
    }
  }
}

function save(filename, html) {
  fs.writeFile(filename, html, function(err) {
    if (err) {
      return console.log(err);
    }

    console.log("The file was saved!");
  });
}

if (config.access_ips.length) {
  console.log(config.access_ips);
  app.use(
    ipfilter(config.access_ips, {
      mode: 'allow'
    })
  );
}

if (config.login && config.password) {
  let users = {};
  users[config.login] = config.password;

  app.use(basicAuth({
    users: users,
    challenge: true,
    realm: 'YM'
  }));
}

app.use((err, req, res, next) => {
  if (err instanceof IpDeniedError) {
    res.status(403).end('forbidden');
  } else {
    next();
  }
})

app.get('/run', function(req, res) {
    let result = {
      error: false
    };

    try {
      const query = req.query.text;

      console.log('run ' + query);

      if (query) {
        const key = getKey();

        let num = getFreeBrowser();

        if (num == null) {
          result.error = true;
        } else {
          BROWSERS[num].free = false;

          let storage = {
            key: key,
            html: null,
            time: new Date()
          }

          ymSearch(query, num, key).then(
            (html) => {
              storage.html = html;
              storage.time = new Date()
            }
          );

          STORAGE.push(storage);

          result.key = key;
        }
      } else {
        result.error = true;
      }
    } catch (error) {
      result.error = true;
    }

    cleanStorage();

    res.json(result);
});

app.get('/get', function(req, res) {
    let result = {
      html: '',
      status: 'empty',
      error: false
    };

    try {
      const key = req.query.key;

      console.log('get ' + key);

      if (key) {
        let index = -1;

        for (let i in STORAGE) {
          if (STORAGE[i].key == key) {
            index = i;
            break;
          }
        }

        if (index == -1) {
          result.status = 'wrong';
        } else {
          if (STORAGE[index].html != null) {
            result.status = 'done';
            result.html = STORAGE[index].html;
            delete STORAGE[index];

            console.log('result length ' + result.html.length);
          }
        }
      } else {
        result.error = true;
      }
    } catch (error) {
      result.error = true;
    }

    res.json(result);
});

app.get('/isfree', function (req, res) {
  let free = getFreeBrowser() == null ? false : true;

  if (free) {
    lastFreeTime = new Date();
  } else {
    let time = new Date();
    time.setMinutes(time.getMinutes() - 5);


    if (time > lastFreeTime) {
      res.json({
        free: false
      });

      process.exit();
    }
  }

  console.log('isfree', free);
  res.json({
    free: free
  });
});

app.get('/stop', function(req, res) {
  closeBrowsers().then(
    () => {

      res.json({status: 'done'});

      console.log('ready to stop');
      http.close();
    }
  )
});

app.get('/restart', function(req, res) {
  res.json({status: 'done'});
  process.exit();
});

function getFreeBrowser() {
  for (let i in BROWSERS) {
    if (BROWSERS[i].free) {
      return i;
    }
  }

  return null;
}

async function getBrowser(num) {
  console.log('get browser ' + num);

  if (typeof BROWSERS[num] != 'undefined') {
    return BROWSERS[num];
  }

  if (typeof BROWSERS[1] != 'undefined') {
    console.log('create page ' + num);
    const page = await BROWSERS[1].browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36');

    try {
      await page.goto(baseUrl);

      await page.waitForSelector('span.region-form-opener span.header2-menu__text', { timeout: 20000 });
    } catch (error) {
      await BROWSERS[1].browser.close();
      process.exit();
    }

    BROWSERS[num] = {
      browser: BROWSERS[1].browser,
      page: page,
      free: true
    }

    return BROWSERS[num];
  }

  const prefix = './log/' + num + '_';

  console.log('create browser ' + num);

  let args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-features=site-per-process',
    '--ignore-certificate-errors',
  ];

  let browser = await puppeteer.launch({
    ignoreHTTPSErrors: true,
    args: args,
    slowMo: 100,
    defaultViewport: {
        width: 1920,
        height: 1080
    }
  });

  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36');

  try {
    await page.goto(baseUrl);

    await page.waitForSelector('span.region-form-opener span.header2-menu__text', { timeout: 20000 });
  } catch (error) {
    if (error.name == 'TimeoutError') {
      return null;
    }
    console.log('error: ' + error.name);
    if (error.message.match(/ERR_CONNECTION/)) {
      return null;
    }
  }

  await page.click('span.region-form-opener span.header2-menu__text');

  try {
    await page.waitForSelector('form.region-select-form', { timeout: 20000 });

    await page.type('form.region-select-form input.input__control', 'Москва');
  } catch (error) {
    console.log('error: ' + error.name);
    console.log('form not found')
  }

  try {
    await page.waitForSelector('div.region-suggest__list-item:first-child', { timeout: 20000 });

    await page.click('div.region-suggest__list-item:first-child');

    await page.click('button.region-select-form__continue-with-new');
  } catch (error) {
    console.log('error: ' + error.name);
    console.log('Ошибка ' + error.name + ":" + error.message + "\n" + error.stack);
  }

  console.log('done');

  BROWSERS[num] = {
    browser: browser,
    page: page,
    free: true
  }

  return BROWSERS[num];
}

async function initBrowsers() {
  for (let i = 1; i <= BROWSERS_COUNT; i++) {
    await getBrowser(i);
  }
}

async function closeBrowsers() {
  for (let i in BROWSERS) {
    console.log('stop browser');
    await BROWSERS[i].browser.close();
    //break;
  }

  BROWSERS = [];
}

initBrowsers();

http.listen(config.port, function() {
  console.log('listening on *:3000');
});
