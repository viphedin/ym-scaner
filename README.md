# ym-scaner
Yandex Market scaner with Headless Chrome

### Config file

````json
{
    "url": "https://market.yandex.ru/", // Yandex market init page
    "browsers": 3,                      // browsers count
    "port": 3000,                       // http service port
    "login": "test",                    // basic auth login
    "password": "test",                 // basic auth password
    "access_ips": [],                   // access auth list
    "debug": true                       // save results image
}
````


### Run as service

#### Install:

``npm i pm2 -g``


#### Commands:

``pm2 start app.js`` - run script as service

``pm2 list`` - services list

``pm2 stop app`` - stop service with name app

``pm2 restart app`` - restart service with name app

``pm2 log`` - services log


### Google Chrome Headless

https://developers.google.com/web/updates/2017/04/headless-chrome