const app = require('express')();
const http = require('http').createServer(app);
const puppeteer = require('puppeteer');
const fs = require('fs');

const baseUrl = 'https://market.yandex.ru/';

let browser = null;

async function ymSearch(query) {
    const page = await browser.newPage();
    await page.goto(baseUrl);

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36');

    console.log('baseUrl');

    await page.type('#header-search', query);

    await page.screenshot({path: 'market1.png'});

    console.log(query);

    await page.click('button[type="submit"]');
    
    let bodyHTML = '';

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

        await page.screenshot({path: 'market2.png'});

        bodyHTML += await page.evaluate(() => document.body.innerHTML);

        try {
            await page.waitForSelector('a.n-pager__button-next', { timeout: 1000 });
            await page.click('a.n-pager__button-next');

            await page.screenshot({path: 'market3.png'});

            bodyHTML += await page.evaluate(() => document.body.innerHTML);        
        } catch (error) {
            console.log("next page didn't appear.")
        }
    } catch (error) {
        console.log('error: ' + error.message);
        
        save('./result.html', await page.evaluate(() => document.body.innerHTML));
    }

    return bodyHTML;
}

function getKey() {
    return (Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).toUpperCase();
}

function cleanStorage() {
    
}

function save(filename, html) {
    fs.writeFile(filename, html, function(err) {
        if (err) {
            return console.log(err);
        }

        console.log("The file was saved!");
    });
}

let STORAGE = {};

app.get('/run', function(req, res) {
    let result = {
        error: false
    };

    try {
        const query = req.query.text;
        
        console.log('run ' + query);

        if (query) {
            const key = getKey();
            
            STORAGE.key = {
                html: null,
                time: new Date()
            };
            
            ymSearch(query).then(
                (html) => {
                    STORAGE.key.html = html;
                }
            );
            
            result.key = key;
        } else {
            result.error = true;
        }
    } catch {
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
            if (typeof STORAGE.key == "undefined") {
                result.status = 'wrong';
            } else {
                if (STORAGE.key.html != null) {
                    result.status = 'done';
                    result.html = STORAGE.key.html;
                    delete STORAGE.key;
                    
                    console.log('result length ' + result.html.length);
                }
            }
        } else {
            result.error = true;
        }
    } catch {
        result.error = true;
    }
    

    res.json(result);
});

puppeteer.launch({
    ignoreHTTPSErrors: true,
    slowMo: 100,
    defaultViewport: {
        width: 1920,
        height: 1080
    }
}).then(
    (mBrowser) => {
        browser = mBrowser;

        http.listen(3000, function(){
          console.log('listening on *:3000');
        });
    }
);