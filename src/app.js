const app = require('express')();
const http = require('http').createServer(app);
const puppeteer = require('puppeteer');
const fs = require('fs');

const baseUrl = 'https://market.yandex.ru/';

let STORAGE = [];

let BROWSERS = [];

const BROWSERS_COUNT = 3;

async function ymSearch(query, num, key) {
  let browser = await getBrowser(num);

  let prefix = 'log/' + key + '_';

  const page = browser.page;

  let bodyHTML = '';

  try {
    await page.screenshot({path: prefix + 'page0.png', fullPage: true});
    
    await page.type('#header-search', query);

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

      //await page.screenshot({path: prefix + 'market2.png'});

      bodyHTML += await page.evaluate(() => document.body.innerHTML);

      try {
        await page.waitForSelector('a.n-pager__button-next', { timeout: 1000 });
        await page.click('a.n-pager__button-next');

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

app.get('/proxies', function(req, res) {
  res.json({
    count: BROWSERS.length
  });
});

app.get('/proxy', function(req, res) {
  let result = {
    error: false
  };

  try {
    const proxy = req.query.proxy;

    getBrowser(proxy);
  } catch (error) {
    result.error = true;
  }

  res.json(result);
});

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
              console.log(storage);
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
  console.log('isfree', getFreeBrowser());
  res.json({
    free: getFreeBrowser() == null ? false : true
  });
});

app.get('/stop', function(req, res) {
  for (let i in BROWSERS) {
    console.log('stoping browser ' + i);
    BROWSERS[i].browser.close();
  }

  res.json({status: 'done'});

  console.log('ready to stop');
  http.close();
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
      if (error.name == 'TimeoutError') {
        return null;
      }
      console.log('error: ' + error.name);
      if (error.message.match(/ERR_CONNECTION/)) {
        return null;
      }
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
/*
    '--no-sandbox',
    '--disable-setuid-sandbox',
*/
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
    await page.screenshot({path: prefix + 'popup1.png', fullPage: true});

//    await page.waitForNavigation();
  } catch (error) {
    console.log('error: ' + error.name);
    console.log('Ошибка ' + error.name + ":" + error.message + "\n" + error.stack);
  }

  await page.screenshot({path: prefix + 'popup2.png', fullPage: true});

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

initBrowsers();

http.listen(3000, function() {
  console.log('listening on *:3000');
});