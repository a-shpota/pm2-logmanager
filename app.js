'use strict';

const pmx = require('pmx');
const pm2 = require('pm2');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

pmx.initModule({
  widget : {
    logo : 'https://app.keymetrics.io/img/logo/keymetrics-300.png',
    theme            : ['#141A1F', '#222222', '#3ff', '#3ff'],
    el : {
      probes  : true,
      actions : true
    },
    block : {
      actions : false,
      issues  : true,
      meta    : true,
      main_probes : ['test-probe']
    }
  }

}, function(err, conf) {
    const loggerConfigs = {};

  pm2.connect(function(err) {
    pm2.list((err, list) => {
      const loggerByPath = {};
      if (!conf.module_conf.configFile) {
        throw new Error('config value "pm2-logmanager:configFile" not defined');
      }

      const configFile = resolvePath(conf.module_conf.configFile);

      if (!fs.existsSync(configFile)) {
        throw new Error(`config file '${configFile}' not exist`);
      }

      let moduleConf = require(configFile);

      list.forEach((app) => {
        if (app.name !== conf.module_name && !loggerConfigs[app.name]) {
          let loggerConfig = moduleConf && moduleConf.appLogsConfig && moduleConf.appLogsConfig[app.name];

          if (loggerConfig || conf.module_conf['logAll']) {
            loggerConfig = loggerConfig || {};
            loggerConfigs[app.name] = {};

            let fileNamePath = resolvePath(loggerConfig.filename || `./logs/${app.name}.log`, app.pm2_env.pm_cwd);

            if (loggerByPath[fileNamePath]) {
              loggerConfigs[app.name].loggerInstance = loggerByPath[fileNamePath];
              return;
            }

            loggerByPath[fileNamePath] = loggerConfigs[app.name].loggerInstance = winston.createLogger({
              format: winston.format.printf((v) => {
                return v.message.replace(/\n+$/, '');
              }),
              transports: [
                new DailyRotateFile({
                  "zippedArchive": true,
                  "datePattern": "",
                  ...loggerConfig,
                  filename: fileNamePath,
                  level: 'info',
                }),
              ]
            })
          }
        }
      });

      pm2.launchBus(function(err, bus) {
        bus.on('log:out', (data) => {
          if (loggerConfigs[data.process.name]) {
            loggerConfigs[data.process.name].loggerInstance.log({
              level: 'info',
              message: data.data
            });
          }
        });
      });
    })
  });
});

function resolvePath(filePath, cwdPath) {
  let fileNamePath = filePath;
  if (!path.isAbsolute(fileNamePath)) {
    fileNamePath = path.resolve(...[cwdPath, fileNamePath].filter(Boolean));
  }
  return fileNamePath;
}
